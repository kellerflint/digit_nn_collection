import { Link } from 'react-router-dom'

export default function InstructionsPage() {
  return (
    <div className="page" style={{ maxWidth: 780 }}>
      <div className="page-title">Instructions</div>

      {/* Overview */}
      <div className="instructions-section">
        <div className="card">
          <p>
            This site has two parts: <strong>collecting training data</strong> (drawing digits) and{' '}
            <strong>submitting your trained model</strong> for evaluation against the class dataset.
            Your model's accuracy will appear on the live leaderboard.
          </p>
        </div>
      </div>

      {/* Part 1: Collect */}
      <div className="instructions-section">
        <h2>Part 1 — Collect Data</h2>
        <div className="card">
          <div className="step-row">
            <span className="step-number">1</span>
            <div className="step-content">
              <p>Go to the <Link to="/collect">Collect Data</Link> page and enter your name and class section.</p>
            </div>
          </div>
          <div className="step-row">
            <span className="step-number">2</span>
            <div className="step-content">
              <p>
                Draw each digit <strong>0 through 9</strong> five times each. Draw clearly on the black
                canvas — the site automatically saves and advances to the next incomplete digit.
              </p>
            </div>
          </div>
          <div className="step-row">
            <span className="step-number">3</span>
            <div className="step-content">
              <p>
                Your drawings are added to the shared class dataset and will be used to evaluate
                everyone's models.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Part 2: Train */}
      <div className="instructions-section">
        <h2>Part 2 — Train Your Model</h2>
        <div className="card">
          <p style={{ marginBottom: '1rem' }}>
            Train a digit classifier in TensorFlow/Keras. Your model must accept 28×28 grayscale images
            with pixel values in <strong>[0.0, 1.0]</strong> and output 10 class scores.
          </p>

          <h3>Recommended model structure (CNN)</h3>
          <pre className="code-block">{`import tensorflow as tf
from tensorflow import keras

model = keras.Sequential([
    keras.layers.Input(shape=(28, 28, 1)),
    keras.layers.Conv2D(32, 3, activation='relu'),
    keras.layers.MaxPooling2D(),
    keras.layers.Conv2D(64, 3, activation='relu'),
    keras.layers.MaxPooling2D(),
    keras.layers.Flatten(),
    keras.layers.Dense(128, activation='relu'),
    keras.layers.Dense(10, activation='softmax'),
])

model.compile(
    optimizer='adam',
    loss='sparse_categorical_crossentropy',
    metrics=['accuracy'],
)

# Normalize your data to [0, 1] before training
# x_train = x_train.astype('float32') / 255.0
# x_train = x_train.reshape(-1, 28, 28, 1)

model.fit(x_train, y_train, epochs=10, validation_split=0.1)`}</pre>

          <h3>Alternative: Dense (flat) model</h3>
          <pre className="code-block">{`model = keras.Sequential([
    keras.layers.Input(shape=(784,)),
    keras.layers.Dense(256, activation='relu'),
    keras.layers.Dense(128, activation='relu'),
    keras.layers.Dense(10, activation='softmax'),
])

# Flatten input: x_train = x_train.reshape(-1, 784)`}</pre>

          <h3>Supported input shapes</h3>
          <ul>
            <li><code>(None, 28, 28, 1)</code> — CNN with explicit channel dimension (recommended)</li>
            <li><code>(None, 28, 28)</code> — CNN without channel dimension</li>
            <li><code>(None, 784)</code> — Flat dense network</li>
          </ul>
        </div>
      </div>

      {/* Part 3: Export */}
      <div className="instructions-section">
        <h2>Part 3 — Export Your Model</h2>
        <div className="card">
          <p style={{ marginBottom: '0.75rem' }}>After training, save your model in Keras format:</p>

          <h3>Option A — .keras format (recommended for TF 2.12+)</h3>
          <pre className="code-block">{`model.save('my_model.keras')`}</pre>

          <h3>Option B — Legacy .h5 format</h3>
          <pre className="code-block">{`model.save('my_model.h5')`}</pre>

          <p style={{ marginTop: '0.75rem', color: 'var(--text-muted)' }}>
            Both formats work. The file will typically be 1–20 MB depending on your model size.
          </p>
        </div>
      </div>

      {/* Part 4: Submit */}
      <div className="instructions-section">
        <h2>Part 4 — Submit</h2>
        <div className="card">
          <div className="step-row">
            <span className="step-number">1</span>
            <div className="step-content">
              <p>Go to the <Link to="/submit">Submit Model</Link> page.</p>
            </div>
          </div>
          <div className="step-row">
            <span className="step-number">2</span>
            <div className="step-content">
              <p>Enter your name and a submission name (something memorable for the leaderboard).</p>
            </div>
          </div>
          <div className="step-row">
            <span className="step-number">3</span>
            <div className="step-content">
              <p>
                Upload your <code>.keras</code> or <code>.h5</code> file. The server will immediately
                evaluate it against the class dataset and show your accuracy.
              </p>
            </div>
          </div>
          <div className="step-row">
            <span className="step-number">4</span>
            <div className="step-content">
              <p>
                Check the <Link to="/predict">Live Predict</Link> page to see your model in action —
                draw a digit and watch it predict in real time alongside other submissions.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Tips */}
      <div className="instructions-section">
        <h2>Tips for Better Accuracy</h2>
        <div className="card">
          <ul>
            <li>Always normalize pixel values to <strong>[0.0, 1.0]</strong> before training and before the site runs your model.</li>
            <li>Use a validation split to avoid overfitting.</li>
            <li>Data augmentation (slight rotations, shifts) can help generalize to hand-drawn input.</li>
            <li>More epochs isn't always better — watch the validation loss.</li>
            <li>CNNs typically outperform dense-only networks on image data.</li>
            <li>You can submit multiple times — each submission is independent on the leaderboard.</li>
          </ul>
        </div>
      </div>
    </div>
  )
}
