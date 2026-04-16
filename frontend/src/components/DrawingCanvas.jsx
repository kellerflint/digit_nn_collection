import { useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react'

const CANVAS_SIZE = 280
const STROKE_WIDTH = 18

const DrawingCanvas = forwardRef(function DrawingCanvas({ onChange }, ref) {
  const canvasRef = useRef(null)
  const drawing = useRef(false)
  const lastPos = useRef(null)

  useImperativeHandle(ref, () => ({
    clear() {
      const ctx = canvasRef.current.getContext('2d')
      ctx.fillStyle = '#000'
      ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE)
      onChange?.(null)
    },
    getBlob() {
      return new Promise((resolve) => {
        canvasRef.current.toBlob(resolve, 'image/png')
      })
    },
    isEmpty() {
      const ctx = canvasRef.current.getContext('2d')
      const data = ctx.getImageData(0, 0, CANVAS_SIZE, CANVAS_SIZE).data
      // Check if any pixel is non-black
      for (let i = 0; i < data.length; i += 4) {
        if (data[i] > 10) return false
      }
      return true
    },
  }))

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE)
  }, [])

  const getPos = (e, canvas) => {
    const rect = canvas.getBoundingClientRect()
    const clientX = e.touches ? e.touches[0].clientX : e.clientX
    const clientY = e.touches ? e.touches[0].clientY : e.clientY
    return {
      x: ((clientX - rect.left) / rect.width) * CANVAS_SIZE,
      y: ((clientY - rect.top) / rect.height) * CANVAS_SIZE,
    }
  }

  const draw = useCallback((e) => {
    if (!drawing.current) return
    e.preventDefault()
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const pos = getPos(e, canvas)

    ctx.strokeStyle = '#fff'
    ctx.lineWidth = STROKE_WIDTH
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    ctx.beginPath()
    if (lastPos.current) {
      ctx.moveTo(lastPos.current.x, lastPos.current.y)
      ctx.lineTo(pos.x, pos.y)
    } else {
      ctx.moveTo(pos.x, pos.y)
      ctx.lineTo(pos.x + 0.1, pos.y + 0.1)
    }
    ctx.stroke()
    lastPos.current = pos
    onChange?.(canvas.toDataURL())
  }, [onChange])

  const startDraw = useCallback((e) => {
    e.preventDefault()
    drawing.current = true
    lastPos.current = null
    draw(e)
  }, [draw])

  const endDraw = useCallback(() => {
    drawing.current = false
    lastPos.current = null
  }, [])

  return (
    <div className="canvas-wrapper" style={{ width: CANVAS_SIZE, height: CANVAS_SIZE }}>
      <canvas
        ref={canvasRef}
        width={CANVAS_SIZE}
        height={CANVAS_SIZE}
        onMouseDown={startDraw}
        onMouseMove={draw}
        onMouseUp={endDraw}
        onMouseLeave={endDraw}
        onTouchStart={startDraw}
        onTouchMove={draw}
        onTouchEnd={endDraw}
        data-testid="drawing-canvas"
      />
    </div>
  )
})

export default DrawingCanvas
