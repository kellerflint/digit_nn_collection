import os
import io
import uuid
import csv
import zipfile
import logging
import asyncio
import threading
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from typing import Optional

import numpy as np
from PIL import Image

from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Depends, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import StreamingResponse
from sqlalchemy import create_engine, Column, Integer, String, Float, Boolean, DateTime, inspect, text, func, event
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ── Config ────────────────────────────────────────────────────────────────────

DATA_DIR = os.environ.get("DATA_DIR", "/data")
IMAGES_DIR = os.path.join(DATA_DIR, "images")
MODELS_DIR = os.path.join(DATA_DIR, "models")
DB_PATH = os.path.join(DATA_DIR, "db.sqlite3")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "changeme")

os.makedirs(IMAGES_DIR, exist_ok=True)
os.makedirs(MODELS_DIR, exist_ok=True)

# ── Database ──────────────────────────────────────────────────────────────────

engine = create_engine(
    f"sqlite:///{DB_PATH}",
    connect_args={"check_same_thread": False},
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


@event.listens_for(engine, "connect")
def _set_sqlite_pragmas(dbapi_conn, _):
    cur = dbapi_conn.cursor()
    cur.execute("PRAGMA journal_mode=WAL")
    cur.execute("PRAGMA synchronous=NORMAL")
    cur.execute("PRAGMA cache_size=-32000")  # 32 MB page cache
    cur.execute("PRAGMA temp_store=MEMORY")
    cur.close()


class DigitImage(Base):
    __tablename__ = "digit_images"
    id = Column(Integer, primary_key=True, index=True)
    label = Column(Integer, nullable=False)
    student_name = Column(String, nullable=False)
    class_name = Column(String, nullable=False)
    filename = Column(String, nullable=False, unique=True)
    is_validation = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class ModelSubmission(Base):
    __tablename__ = "model_submissions"
    id = Column(Integer, primary_key=True, index=True)
    submission_name = Column(String, nullable=False)
    student_name = Column(String, nullable=False)
    filename = Column(String, nullable=False, unique=True)
    accuracy = Column(Float, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class ClassSection(Base):
    __tablename__ = "class_sections"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False, unique=True)


Base.metadata.create_all(bind=engine)


def _migrate():
    """Add any missing columns to existing databases."""
    with engine.connect() as conn:
        insp = inspect(engine)
        if "digit_images" in insp.get_table_names():
            existing = {c["name"] for c in insp.get_columns("digit_images")}
            if "is_validation" not in existing:
                conn.execute(text(
                    "ALTER TABLE digit_images ADD COLUMN is_validation BOOLEAN NOT NULL DEFAULT 0"
                ))
                conn.commit()
                logger.info("Migrated: added is_validation column")

_migrate()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ── TensorFlow (lazy, thread-safe) ────────────────────────────────────────────
# TF is only imported when a model is actually used. This keeps startup fast
# and lets the backend run without TF installed (digit collection still works).

_tf = None
_tf_lock = threading.Lock()


def _get_tf():
    global _tf
    if _tf is None:
        with _tf_lock:
            if _tf is None:
                try:
                    import tensorflow as tf
                    _tf = tf
                except ImportError:
                    raise HTTPException(status_code=501, detail="TensorFlow not available on this server")
    return _tf


# ── Model cache ───────────────────────────────────────────────────────────────
# Keras models are safe for concurrent inference. Since every upload gets a
# UUID filename, paths are immutable — no invalidation needed except on delete.

_model_cache: dict = {}
_model_cache_lock = threading.Lock()


def get_cached_model(model_path: str):
    """Load a Keras model from disk, caching it in memory by path."""
    with _model_cache_lock:
        if model_path not in _model_cache:
            _model_cache[model_path] = load_keras_model(model_path)
        return _model_cache[model_path]


def evict_model_cache(model_path: str) -> None:
    with _model_cache_lock:
        _model_cache.pop(model_path, None)


# ── Thread pool for CPU-bound TF work ────────────────────────────────────────
# Limits concurrent TF jobs so we don't saturate the server.
_executor = ThreadPoolExecutor(max_workers=2)


# ── Image helpers ─────────────────────────────────────────────────────────────

def preprocess_for_inference(img_bytes: bytes) -> np.ndarray:
    """Convert image bytes to (28, 28, 1) float32 array normalised to [0, 1]."""
    img = Image.open(io.BytesIO(img_bytes)).convert("L")
    img = img.resize((28, 28), Image.LANCZOS)
    arr = np.array(img, dtype=np.float32) / 255.0
    return arr.reshape(28, 28, 1)


def load_keras_model(model_path: str):
    tf = _get_tf()
    return tf.keras.models.load_model(model_path, compile=False)


def run_inference(model_path: str, img_bytes: bytes) -> Optional[dict]:
    """
    Run single prediction. Handles Keras input shapes:
      (None, 28, 28, 1) | (None, 28, 28) | (None, 784)
    Returns {"prediction": int, "probabilities": [float x10]}
    """
    tf = _get_tf()
    try:
        model = get_cached_model(model_path)
        arr = preprocess_for_inference(img_bytes)
        input_shape = model.input_shape

        if len(input_shape) == 4:
            x = arr.reshape(1, 28, 28, 1)
        elif len(input_shape) == 3:
            x = arr.reshape(1, 28, 28)
        elif len(input_shape) == 2 and input_shape[1] == 784:
            x = arr.reshape(1, 784)
        else:
            x = arr.reshape(1, 28, 28, 1)

        preds = model.predict(x, verbose=0)[0]
        if preds.min() < 0 or preds.sum() < 0.99 or preds.sum() > 1.01:
            preds = tf.nn.softmax(preds).numpy()

        return {"prediction": int(np.argmax(preds)), "probabilities": preds.tolist()}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Inference error: {e}")
        return None


def compute_accuracy(model_path: str, image_data: list) -> Optional[float]:
    """
    Batch accuracy over validation images.
    image_data: list of (absolute_image_path, label) tuples pre-loaded from DB.
    All images are batched into a single model.predict() call.
    """
    if not image_data:
        return None
    try:
        model = get_cached_model(model_path)
    except Exception as e:
        logger.error(f"Failed to load model for accuracy: {e}")
        return None

    input_shape = model.input_shape
    arrays = []
    labels = []
    for img_path, label in image_data:
        if not os.path.exists(img_path):
            continue
        try:
            with open(img_path, "rb") as f:
                arr = preprocess_for_inference(f.read())
            arrays.append(arr)
            labels.append(label)
        except Exception as e:
            logger.warning(f"Skipping {img_path}: {e}")

    if not arrays:
        return None

    batch = np.stack(arrays)  # (N, 28, 28, 1)
    if len(input_shape) == 4:
        x = batch.reshape(-1, 28, 28, 1)
    elif len(input_shape) == 3:
        x = batch.reshape(-1, 28, 28)
    elif len(input_shape) == 2 and input_shape[1] == 784:
        x = batch.reshape(-1, 784)
    else:
        x = batch.reshape(-1, 28, 28, 1)

    preds = model.predict(x, verbose=0)
    predicted = np.argmax(preds, axis=1)
    correct = int(np.sum(predicted == np.array(labels, dtype=np.int32)))
    return correct / len(labels)


def _val_image_data(db: Session) -> list:
    """Load validation image paths and labels from DB (fast, no TF)."""
    rows = db.query(DigitImage.filename, DigitImage.label).filter(
        DigitImage.is_validation == True
    ).all()
    return [(os.path.join(IMAGES_DIR, filename), label) for filename, label in rows]


# ── App ───────────────────────────────────────────────────────────────────────

app = FastAPI(title="Digit NN Site")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/images", StaticFiles(directory=IMAGES_DIR), name="images")


def check_admin(password: Optional[str]) -> bool:
    return password == ADMIN_PASSWORD


# ── Digit endpoints ───────────────────────────────────────────────────────────

@app.post("/api/digits")
async def upload_digit(
    label: int = Form(...),
    student_name: str = Form(...),
    class_name: str = Form(...),
    image: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    if label < 0 or label > 9:
        raise HTTPException(status_code=400, detail="Label must be 0-9")

    content = await image.read()
    filename = f"{uuid.uuid4().hex}.png"
    save_path = os.path.join(IMAGES_DIR, filename)

    try:
        img = Image.open(io.BytesIO(content)).convert("L")
        img.save(save_path, "PNG")
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid image")

    # Every 5th submission from this student for this digit goes to validation
    existing_count = (
        db.query(DigitImage)
        .filter(DigitImage.student_name == student_name, DigitImage.label == label)
        .count()
    )
    is_validation = (existing_count % 5 == 4)

    record = DigitImage(
        label=label,
        student_name=student_name,
        class_name=class_name,
        filename=filename,
        is_validation=is_validation,
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return {"id": record.id, "filename": filename, "is_validation": is_validation}


@app.get("/api/digits")
def list_digits(
    class_name: Optional[str] = None,
    label: Optional[int] = None,
    db: Session = Depends(get_db),
):
    q = db.query(DigitImage)
    if class_name:
        q = q.filter(DigitImage.class_name == class_name)
    if label is not None:
        q = q.filter(DigitImage.label == label)
    items = q.order_by(DigitImage.created_at.desc()).all()
    return [
        {
            "id": i.id,
            "label": i.label,
            "student_name": i.student_name,
            "class_name": i.class_name,
            "filename": i.filename,
            "is_validation": i.is_validation,
            "created_at": i.created_at.isoformat() if i.created_at else None,
        }
        for i in items
    ]


@app.get("/api/digits/download")
def download_digits(
    class_name: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """Stream a zip of training-only images (validation excluded)."""
    q = db.query(DigitImage).filter(DigitImage.is_validation == False)
    if class_name:
        q = q.filter(DigitImage.class_name == class_name)
    items = q.order_by(DigitImage.created_at).all()

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
        csv_buf = io.StringIO()
        writer = csv.writer(csv_buf)
        writer.writerow(["filename", "label", "student_name", "class_name", "created_at"])
        for item in items:
            writer.writerow([
                item.filename, item.label, item.student_name,
                item.class_name, item.created_at.isoformat() if item.created_at else "",
            ])
        zf.writestr("labels.csv", csv_buf.getvalue())
        for item in items:
            img_path = os.path.join(IMAGES_DIR, item.filename)
            if os.path.exists(img_path):
                zf.write(img_path, f"digits/{item.label}/{item.filename}")

    buf.seek(0)
    suffix = f"_{class_name}" if class_name else ""
    return StreamingResponse(
        buf,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="digit_dataset{suffix}.zip"'},
    )


@app.get("/api/digits/stats")
def digit_stats(
    class_name: Optional[str] = None,
    db: Session = Depends(get_db),
):
    # SQL aggregation instead of loading all rows into Python
    q = db.query(
        DigitImage.label,
        DigitImage.is_validation,
        func.count(DigitImage.id).label("cnt"),
    )
    if class_name:
        q = q.filter(DigitImage.class_name == class_name)
    rows = q.group_by(DigitImage.label, DigitImage.is_validation).all()

    histogram = {str(i): 0 for i in range(10)}
    val_histogram = {str(i): 0 for i in range(10)}
    training_total = 0
    validation_total = 0
    for label, is_val, cnt in rows:
        if is_val:
            val_histogram[str(label)] = cnt
            validation_total += cnt
        else:
            histogram[str(label)] = cnt
            training_total += cnt

    class_q = db.query(DigitImage.class_name).distinct()
    if class_name:
        class_q = class_q.filter(DigitImage.class_name == class_name)
    class_names = sorted(r[0] for r in class_q.all())

    return {
        "histogram": histogram,
        "val_histogram": val_histogram,
        "total": training_total + validation_total,
        "training_total": training_total,
        "validation_total": validation_total,
        "class_names": class_names,
    }


@app.post("/api/digits/{digit_id}/toggle-validation")
def toggle_validation(
    digit_id: int,
    x_admin_password: str = Query(...),
    db: Session = Depends(get_db),
):
    if not check_admin(x_admin_password):
        raise HTTPException(status_code=401, detail="Unauthorized")
    record = db.query(DigitImage).filter(DigitImage.id == digit_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Not found")
    record.is_validation = not record.is_validation
    db.commit()
    return {"id": record.id, "is_validation": record.is_validation}


@app.delete("/api/digits/{digit_id}")
def delete_digit(
    digit_id: int,
    x_admin_password: str = Query(...),
    db: Session = Depends(get_db),
):
    if not check_admin(x_admin_password):
        raise HTTPException(status_code=401, detail="Unauthorized")
    record = db.query(DigitImage).filter(DigitImage.id == digit_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Not found")
    img_path = os.path.join(IMAGES_DIR, record.filename)
    if os.path.exists(img_path):
        os.remove(img_path)
    db.delete(record)
    db.commit()
    return {"ok": True}


# ── Model endpoints ───────────────────────────────────────────────────────────

@app.post("/api/models")
async def upload_model(
    submission_name: str = Form(...),
    student_name: str = Form(...),
    model: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    content = await model.read()
    original_name = model.filename or "model"
    ext = ".keras" if original_name.endswith(".keras") else ".h5"
    filename = f"{uuid.uuid4().hex}{ext}"
    save_path = os.path.join(MODELS_DIR, filename)

    with open(save_path, "wb") as f:
        f.write(content)

    # Validate and cache the model (quick load, populates cache for accuracy step)
    try:
        get_cached_model(save_path)
    except HTTPException:
        os.remove(save_path)
        raise
    except Exception as e:
        os.remove(save_path)
        raise HTTPException(status_code=400, detail=f"Invalid Keras model: {e}")

    # Snapshot validation image paths+labels before leaving the DB session
    image_data = _val_image_data(db)

    # Run batch accuracy in thread pool — non-blocking, model already cached
    loop = asyncio.get_running_loop()
    accuracy = await loop.run_in_executor(
        _executor, lambda: compute_accuracy(save_path, image_data)
    )

    record = ModelSubmission(
        submission_name=submission_name,
        student_name=student_name,
        filename=filename,
        accuracy=accuracy,
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return {
        "id": record.id,
        "submission_name": record.submission_name,
        "accuracy": record.accuracy,
    }


@app.get("/api/models")
def list_models(db: Session = Depends(get_db)):
    items = (
        db.query(ModelSubmission)
        .order_by(ModelSubmission.accuracy.desc().nulls_last())
        .all()
    )
    return [
        {
            "id": i.id,
            "submission_name": i.submission_name,
            "student_name": i.student_name,
            "accuracy": i.accuracy,
            "created_at": i.created_at.isoformat() if i.created_at else None,
        }
        for i in items
    ]


@app.delete("/api/models/{model_id}")
def delete_model(
    model_id: int,
    x_admin_password: str = Query(...),
    db: Session = Depends(get_db),
):
    if not check_admin(x_admin_password):
        raise HTTPException(status_code=401, detail="Unauthorized")
    record = db.query(ModelSubmission).filter(ModelSubmission.id == model_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Not found")
    model_path = os.path.join(MODELS_DIR, record.filename)
    if os.path.exists(model_path):
        os.remove(model_path)
        evict_model_cache(model_path)
    db.delete(record)
    db.commit()
    return {"ok": True}


@app.post("/api/models/{model_id}/recalculate")
async def recalculate_accuracy(
    model_id: int,
    x_admin_password: str = Query(...),
    db: Session = Depends(get_db),
):
    if not check_admin(x_admin_password):
        raise HTTPException(status_code=401, detail="Unauthorized")
    record = db.query(ModelSubmission).filter(ModelSubmission.id == model_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Not found")
    model_path = os.path.join(MODELS_DIR, record.filename)

    image_data = _val_image_data(db)
    loop = asyncio.get_running_loop()
    accuracy = await loop.run_in_executor(
        _executor, lambda: compute_accuracy(model_path, image_data)
    )
    record.accuracy = accuracy
    db.commit()
    return {"id": record.id, "accuracy": accuracy}


@app.post("/api/predict/{model_id}")
async def predict(
    model_id: int,
    image: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    record = db.query(ModelSubmission).filter(ModelSubmission.id == model_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Model not found")
    model_path = os.path.join(MODELS_DIR, record.filename)
    if not os.path.exists(model_path):
        raise HTTPException(status_code=404, detail="Model file missing")
    content = await image.read()

    loop = asyncio.get_running_loop()
    result = await loop.run_in_executor(_executor, run_inference, model_path, content)
    if result is None:
        raise HTTPException(status_code=500, detail="Inference failed")
    return result


# ── Class sections ────────────────────────────────────────────────────────────

@app.get("/api/classes")
def list_classes(db: Session = Depends(get_db)):
    items = db.query(ClassSection).order_by(ClassSection.name).all()
    return [{"id": i.id, "name": i.name} for i in items]


@app.post("/api/classes")
def add_class(
    name: str = Form(...),
    x_admin_password: str = Query(...),
    db: Session = Depends(get_db),
):
    if not check_admin(x_admin_password):
        raise HTTPException(status_code=401, detail="Unauthorized")
    name = name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name required")
    if db.query(ClassSection).filter(ClassSection.name == name).first():
        raise HTTPException(status_code=409, detail="Class already exists")
    record = ClassSection(name=name)
    db.add(record)
    db.commit()
    db.refresh(record)
    return {"id": record.id, "name": record.name}


@app.delete("/api/classes/{class_id}")
def delete_class(
    class_id: int,
    x_admin_password: str = Query(...),
    db: Session = Depends(get_db),
):
    if not check_admin(x_admin_password):
        raise HTTPException(status_code=401, detail="Unauthorized")
    record = db.query(ClassSection).filter(ClassSection.id == class_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Not found")
    db.delete(record)
    db.commit()
    return {"ok": True}


# ── Admin ─────────────────────────────────────────────────────────────────────

@app.post("/api/admin/login")
async def admin_login(password: str = Form(...)):
    if password != ADMIN_PASSWORD:
        raise HTTPException(status_code=401, detail="Wrong password")
    return {"ok": True}


@app.get("/api/admin/verify")
def admin_verify(x_admin_password: str = Query(...)):
    if x_admin_password != ADMIN_PASSWORD:
        raise HTTPException(status_code=401, detail="Unauthorized")
    return {"ok": True}


@app.get("/api/health")
def health():
    return {"status": "ok"}
