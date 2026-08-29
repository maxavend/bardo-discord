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

  const progressClamped = Math.min(100, Math.max(0, value));
  const targetLength = Math.max(0, (progressClamped / 100) * containerHeight);
  const currentLengthRef = useRef(targetLength);
  const [animatedLength, setAnimatedLength] = useState(targetLength);

  // Amplitud dinámica: Se pone recta (0) al pausar, y vuelve a ondularse al dar play
  const targetAmplitude = isPaused ? 0 : amplitude;
  const currentAmplitudeRef = useRef(targetAmplitude);
  const [animatedAmplitude, setAnimatedAmplitude] = useState(targetAmplitude);

  // Frecuencia y velocidad dinámicas según el estado de urgencia de tiempo
  const effectiveWavelength = color === 'danger' ? 36 : color === 'warning' ? 48 : wavelength;
  const cycleDuration = color === 'danger' ? 800 : color === 'warning' ? 1400 : 2800; // ms

  // Smooth continuous phase animation + sub-pixel fluid fill loop (60fps)
  useEffect(() => {
    let rafId;
    let lastTime = performance.now();
    const speed = effectiveWavelength / cycleDuration; // px per ms

    const loop = (now) => {
      const delta = Math.min(64, now - lastTime);
      lastTime = now;

      // 1. Keep the wave phase frozen for the whole pause transition.
      // The amplitude still eases to zero below, leaving a straight line.
      if (!isPaused) {
        setPhase((prev) => (prev + delta * speed) % effectiveWavelength);
      }

      // 2. Smoothly flatten the wave to a straight line while paused.
      const ampDiff = targetAmplitude - currentAmplitudeRef.current;
      let needsFrame = !isPaused;
      if (Math.abs(ampDiff) > 0.01) {
        currentAmplitudeRef.current += ampDiff * Math.min(1, delta * 0.010);
        setAnimatedAmplitude(currentAmplitudeRef.current);
        needsFrame = true;
      } else if (currentAmplitudeRef.current !== targetAmplitude) {
        currentAmplitudeRef.current = targetAmplitude;
        setAnimatedAmplitude(targetAmplitude);
        needsFrame = true;
      }

      // 3. Smooth continuous sub-pixel progress fill (no discrete jumps).
      // Once paused, keep the current fill length fixed; only the wave shape
      // flattens so the progress cannot keep creeping forward.
      if (!isPaused) {
        const diff = targetLength - currentLengthRef.current;
        if (Math.abs(diff) > 0.02) {
          currentLengthRef.current += diff * Math.min(1, delta * 0.006);
          setAnimatedLength(currentLengthRef.current);
          needsFrame = true;
        } else if (currentLengthRef.current !== targetLength) {
          currentLengthRef.current = targetLength;
          setAnimatedLength(targetLength);
          needsFrame = true;
        }
      }

      if (needsFrame) rafId = requestAnimationFrame(loop);
    };

    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, [isPaused, targetAmplitude, effectiveWavelength, cycleDuration, targetLength]);

  // Generate physics-based envelope sine path with animatedLength and animatedAmplitude
  const wavePath = useMemo(() => {
    if (animatedLength <= 2) {
      return '';
    }

    const cx = 10;

    // Si la amplitud ya está en 0 (pausado), trazo recto perfecto sin oscilación
    if (animatedAmplitude <= 0.02) {
      return `M ${cx} 0 L ${cx} ${animatedLength.toFixed(2)}`;
    }

    const step = 3; // 3px resolution gives smooth 60fps spline
    const dampZone = Math.min(28, animatedLength * 0.35); // Transition zone at edges

    let d = `M ${cx} 0`;
    const numPoints = Math.ceil(animatedLength / step);

    for (let i = 1; i <= numPoints; i++) {
      const y = Math.min(animatedLength, i * step);

      // Boundary Envelope: Smooth cubic ease-in at top and ease-out at tip
      const inFactor = dampZone > 0 ? Math.min(1, y / dampZone) : 1;
      const outFactor = dampZone > 0 ? Math.min(1, (animatedLength - y) / dampZone) : 1;
      // Smooth step easing (3x^2 - 2x^3)
      const easeIn = inFactor * inFactor * (3 - 2 * inFactor);
      const easeOut = outFactor * outFactor * (3 - 2 * outFactor);
      const envelope = easeIn * easeOut;

      const angle = (2 * Math.PI * (y + phase)) / effectiveWavelength;
      const x = cx + animatedAmplitude * envelope * Math.sin(angle);

      d += ` L ${x.toFixed(2)} ${y.toFixed(2)}`;
    }

    // Ensure final point lands precisely on center of track
    d += ` L ${cx} ${animatedLength.toFixed(2)}`;
    return d;
  }, [animatedLength, animatedAmplitude, phase, effectiveWavelength]);

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
        {/* 1. Remaining inactive track. The active wave consumes the track above it. */}
        <line
          x1="10"
          y1={Math.min(containerHeight, Math.max(0, animatedLength))}
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
