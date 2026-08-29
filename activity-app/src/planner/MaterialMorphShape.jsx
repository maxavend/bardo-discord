import {useEffect, useMemo, useRef, useState} from 'react';

const MORPH_EASING = [0.77, 0, 0.175, 1];
const COMPLETION_MORPH_DURATION = 220;

function cubicBezier(x1, y1, x2, y2) {
  const sampleCurveX = (t) => ((1 - 3 * x2 + 3 * x1) * t * t * t) + ((3 * x2 - 6 * x1) * t * t) + (3 * x1 * t);
  const sampleCurveY = (t) => ((1 - 3 * y2 + 3 * y1) * t * t * t) + ((3 * y2 - 6 * y1) * t * t) + (3 * y1 * t);
  const sampleCurveDerivativeX = (t) => (3 * (1 - 3 * x2 + 3 * x1) * t * t) + (2 * (3 * x2 - 6 * x1) * t) + (3 * x1);

  return (progress) => {
    let t = progress;

    // Newton-Raphson converges quickly for the monotonic x curve used here.
    for (let index = 0; index < 5; index += 1) {
      const derivative = sampleCurveDerivativeX(t);
      if (Math.abs(derivative) < 0.0001) break;
      t -= (sampleCurveX(t) - progress) / derivative;
    }

    // Keep the result stable on slower devices if Newton-Raphson lands outside
    // the curve's domain during a dropped frame.
    t = Math.min(1, Math.max(0, t));
    return sampleCurveY(t);
  };
}

function interpolateNumbers(from, to, progress) {
  return from.map((value, index) => value + (to[index] - value) * progress);
}

function buildPath(numbers) {
  let cursor = 0;
  let path = `M ${numbers[cursor++].toFixed(2)} ${numbers[cursor++].toFixed(2)}`;

  for (let index = 0; index < 16; index += 1) {
    path += ` C ${numbers[cursor++].toFixed(2)} ${numbers[cursor++].toFixed(2)}, ${numbers[cursor++].toFixed(2)} ${numbers[cursor++].toFixed(2)}, ${numbers[cursor++].toFixed(2)} ${numbers[cursor++].toFixed(2)}`;
  }

  return `${path} Z`;
}

function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Material Design 3 Expressive morphing shape indicator.
 *
 * Every shape uses the same 16 cubic segments, so the active loop and the
 * active-to-complete transition can interpolate the path without changing
 * topology or snapping to a new DOM element.
 */
export function MaterialMorphShape({
  size = 14,
  color = 'accent',
  isPaused = false,
  isActive = true,
  isCompleted = false,
  className = '',
}) {
  const paths = useMemo(() => {
    const cx = 16;
    const cy = 16;
    const numPoints = 16;
    const deltaTheta = (2 * Math.PI) / numPoints;

    const generateShape = (rFunc) => {
      const points = [];
      const tangents = [];
      const numbers = [];

      for (let index = 0; index < numPoints; index += 1) {
        const theta = index * deltaTheta;
        const radius = rFunc(theta);
        const point = {
          x: cx + radius * Math.cos(theta),
          y: cy + radius * Math.sin(theta),
        };
        const derivative = (rFunc(theta + 0.01) - rFunc(theta - 0.01)) / 0.02;
        const tangentScale = deltaTheta / 3;

        points.push(point);
        tangents.push({
          x: (derivative * Math.cos(theta) - radius * Math.sin(theta)) * tangentScale,
          y: (derivative * Math.sin(theta) + radius * Math.cos(theta)) * tangentScale,
        });
      }

      numbers.push(points[0].x, points[0].y);
      for (let index = 0; index < numPoints; index += 1) {
        const next = (index + 1) % numPoints;
        numbers.push(
          points[index].x + tangents[index].x,
          points[index].y + tangents[index].y,
          points[next].x - tangents[next].x,
          points[next].y - tangents[next].y,
          points[next].x,
          points[next].y,
        );
      }

      return {numbers, d: buildPath(numbers)};
    };

    const circle = generateShape(() => 12);
    const fivePoint = generateShape((theta) => 11.5 + 2.8 * Math.cos(5 * theta - Math.PI / 2));
    const pebble = generateShape((theta) => 11.5 + 3.4 * Math.cos(2 * theta - 0.7));
    const scallop = generateShape((theta) => 11.2 + 2.4 * Math.cos(8 * theta));

    return {
      sequence: [circle, fivePoint, pebble, scallop, circle],
      circle,
    };
  }, []);

  const colorClass =
    color === 'danger'
      ? 'text-danger'
      : color === 'warning'
      ? 'text-warning'
      : color === 'success'
      ? 'text-success'
      : 'text-accent';

  // Frecuencia dinámica: aumenta velocidad cuando se acaba el tiempo (<5m o overtime).
  const morphDurationMs = color === 'danger' ? 1600 : color === 'warning' ? 3200 : 8000;
  const rotationDuration = color === 'danger' ? '3s' : color === 'warning' ? '6s' : '16s';
  const [pathD, setPathD] = useState(paths.circle.d);
  const [reducedMotion, setReducedMotion] = useState(prefersReducedMotion);
  const motionRef = useRef({
    mode: isActive ? 'loop' : 'static',
    phase: 0,
    currentNumbers: paths.circle.numbers,
    completionFrom: null,
    completionStartedAt: null,
  });
  const wasActiveRef = useRef(isActive);

  useEffect(() => {
    const mediaQuery = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!mediaQuery) return undefined;

    const updatePreference = () => setReducedMotion(mediaQuery.matches);
    updatePreference();
    mediaQuery.addEventListener?.('change', updatePreference);
    return () => mediaQuery.removeEventListener?.('change', updatePreference);
  }, []);

  useEffect(() => {
    const wasActive = wasActiveRef.current;
    wasActiveRef.current = isActive;

    if (isActive) {
      motionRef.current.mode = 'loop';
      motionRef.current.completionFrom = null;
      motionRef.current.completionStartedAt = null;
      return;
    }

    if (isCompleted && wasActive) {
      motionRef.current.mode = 'completion';
      motionRef.current.completionFrom = motionRef.current.currentNumbers.slice();
      motionRef.current.completionStartedAt = null;
    } else if (!isCompleted) {
      motionRef.current.mode = 'static';
    }
  }, [isActive, isCompleted]);

  useEffect(() => {
    if (reducedMotion) {
      motionRef.current.mode = 'static';
      motionRef.current.currentNumbers = paths.circle.numbers;
      setPathD(paths.circle.d);
      return undefined;
    }

    if (isPaused || (!isActive && motionRef.current.mode !== 'completion')) {
      return undefined;
    }

    let frameId;
    let lastTime = null;
    const easing = cubicBezier(...MORPH_EASING);

    const tick = (now) => {
      const motion = motionRef.current;
      const delta = lastTime === null ? 0 : Math.min(64, now - lastTime);
      lastTime = now;

      if (motion.mode === 'completion') {
        if (motion.completionStartedAt === null) motion.completionStartedAt = now;
        const rawProgress = Math.min(1, (now - motion.completionStartedAt) / COMPLETION_MORPH_DURATION);
        const progress = easing(rawProgress);
        motion.currentNumbers = interpolateNumbers(motion.completionFrom, paths.circle.numbers, progress);
        setPathD(buildPath(motion.currentNumbers));

        if (rawProgress >= 1) {
          motion.mode = 'static';
          motion.currentNumbers = paths.circle.numbers;
          setPathD(paths.circle.d);
          return;
        }
      } else if (motion.mode === 'loop') {
        motion.phase = (motion.phase + (delta / morphDurationMs) * 4) % 4;
        const segmentIndex = Math.floor(motion.phase);
        const segmentProgress = easing(motion.phase - segmentIndex);
        const from = paths.sequence[segmentIndex];
        const to = paths.sequence[segmentIndex + 1];
        motion.currentNumbers = interpolateNumbers(from.numbers, to.numbers, segmentProgress);
        setPathD(buildPath(motion.currentNumbers));
      }

      frameId = requestAnimationFrame(tick);
    };

    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [isActive, isPaused, morphDurationMs, paths, reducedMotion]);

  return (
    <div
      className={`relative flex items-center justify-center select-none ${className}`}
      style={{width: size, height: size}}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 32 32"
        width={size}
        height={size}
        style={{animationDuration: rotationDuration}}
        className={`m3-morph-svg ${colorClass} ${isPaused ? 'is-paused' : ''}`}
        fill="currentColor"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path d={pathD} />
      </svg>
    </div>
  );
}
