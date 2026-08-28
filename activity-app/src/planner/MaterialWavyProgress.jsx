import {useState, useEffect, useRef, useMemo} from 'react';

/**
 * Material Design 3 Expressive Wavy Progress Indicator
 * Implements Android 14 / SystemUI physics-based boundary envelope:
 * - Start (y=0) is anchored at track center (amplitude = 0) with a rounded cap.
 * - Tip (y=activeLength) is anchored at track center (amplitude = 0) with a rounded cap,
 *   merging seamlessly into the gray track without horizontal jitter.
 * - Smooth cubic envelope transitions into the animated travelling sine wave in between.
 */
export function MaterialWavyProgress({
  value = 50, // Progress 0-100
  orientation = 'vertical',
  strokeWidth = 4.5,
  wavelength = 72,
  amplitude = 3.5,
  color = 'accent',
  isPaused = false,
  showStopDot = true,
  className = '',
}) {
  const containerRef = useRef(null);
  const [containerHeight, setContainerHeight] = useState(120);
  const [phase, setPhase] = useState(0);

  // Measure container height dynamically
  useEffect(() => {
    if (!containerRef.current) return;
    const updateHeight = () => {
      if (containerRef.current) {
        const h = containerRef.current.clientHeight;
        if (h > 10) setContainerHeight(h);
      }
    };
    updateHeight();

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.height > 10) {
          setContainerHeight(entry.contentRect.height);
        }
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Smooth continuous phase animation loop (2.8s per wave cycle)
  useEffect(() => {
    if (isPaused) return;
    let rafId;
    let lastTime = performance.now();
    const speed = wavelength / 2800; // px per ms

    const loop = (now) => {
      const delta = Math.min(64, now - lastTime);
      lastTime = now;
      setPhase((prev) => (prev + delta * speed) % wavelength);
      rafId = requestAnimationFrame(loop);
    };
    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, [isPaused, wavelength]);

  const progressClamped = Math.min(100, Math.max(0, value));
  const activeLength = Math.max(0, (progressClamped / 100) * containerHeight);

  // Generate physics-based envelope sine path
  const wavePath = useMemo(() => {
    if (activeLength <= 2) {
      return '';
    }

    const cx = 10;
    const step = 3; // 3px resolution gives smooth 60fps spline
    const dampZone = Math.min(28, activeLength * 0.35); // Transition zone at edges

    let d = `M ${cx} 0`;
    const numPoints = Math.ceil(activeLength / step);

    for (let i = 1; i <= numPoints; i++) {
      const y = Math.min(activeLength, i * step);

      // Boundary Envelope: Smooth cubic ease-in at top and ease-out at tip
      const inFactor = dampZone > 0 ? Math.min(1, y / dampZone) : 1;
      const outFactor = dampZone > 0 ? Math.min(1, (activeLength - y) / dampZone) : 1;
      // Smooth step easing (3x^2 - 2x^3)
      const easeIn = inFactor * inFactor * (3 - 2 * inFactor);
      const easeOut = outFactor * outFactor * (3 - 2 * outFactor);
      const envelope = easeIn * easeOut;

      const angle = (2 * Math.PI * (y + phase)) / wavelength;
      const x = cx + amplitude * envelope * Math.sin(angle);

      d += ` L ${x.toFixed(2)} ${y.toFixed(2)}`;
    }

    // Ensure final point lands precisely on center of track
    d += ` L ${cx} ${activeLength.toFixed(2)}`;
    return d;
  }, [activeLength, phase, wavelength, amplitude]);

  const colorClass =
    color === 'danger'
      ? 'text-danger'
      : color === 'warning'
      ? 'text-warning'
      : color === 'success'
      ? 'text-success'
      : 'text-accent';

  return (
    <div
      ref={containerRef}
      role="progressbar"
      aria-valuenow={progressClamped}
      aria-valuemin={0}
      aria-valuemax={100}
      className={`m3-wavy-progress-root ${orientation} ${isPaused ? 'is-paused' : ''} ${className}`}
      aria-hidden="true"
    >
      <svg
        className="w-full h-full"
        style={{ width: '20px', height: '100%', overflow: 'visible' }}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* 1. Background Inactive Gray Track (Full Height, 4.5px, Rounded Caps) */}
        <line
          x1="10"
          y1="0"
          x2="10"
          y2={containerHeight}
          stroke="color-mix(in srgb, var(--border) 40%, transparent)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />

        {/* 2. Stop Dot at Bottom (when not near 100%) */}
        {showStopDot && progressClamped < 94 && (
          <circle
            cx="10"
            cy={Math.max(0, containerHeight - 1)}
            r={strokeWidth / 2}
            fill="color-mix(in srgb, var(--border) 60%, transparent)"
          />
        )}

        {/* 3. Active Wave Track with Physics Envelope (Rounded Caps, Zero-Jitter Endpoints) */}
        {wavePath && (
          <path
            d={wavePath}
            className={colorClass}
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
      </svg>
    </div>
  );
}
