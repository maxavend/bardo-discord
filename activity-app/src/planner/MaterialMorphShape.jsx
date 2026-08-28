import {useMemo} from 'react';

/**
 * Material Design 3 Expressive Morphing Shape Indicator
 * Smoothly morphs between iconic Material 3 Expressive shapes:
 * 1. Squircle / Smooth Circle
 * 2. 5-point Rounded Flower / Pentagon (Image 3)
 * 3. Angled Pebble / Oblong (Image 2 & 4)
 * 4. 8-point Scallop Flower / Daisy (Image 5)
 */
export function MaterialMorphShape({
  size = 14,
  color = 'accent',
  isPaused = false,
  className = '',
}) {
  const paths = useMemo(() => {
    const cx = 16;
    const cy = 16;
    const numPoints = 16;

    const generatePath = (rFunc) => {
      const pts = [];
      const tangents = [];
      const deltaTheta = (2 * Math.PI) / numPoints;

      for (let i = 0; i < numPoints; i++) {
        const theta = i * deltaTheta;
        const r = rFunc(theta);
        const px = cx + r * Math.cos(theta);
        const py = cy + r * Math.sin(theta);
        pts.push({x: px, y: py});

        // Tangent vector
        const dr_dtheta = (rFunc(theta + 0.01) - rFunc(theta - 0.01)) / 0.02;
        const tx = (dr_dtheta * Math.cos(theta) - r * Math.sin(theta)) * (deltaTheta / 3);
        const ty = (dr_dtheta * Math.sin(theta) + r * Math.cos(theta)) * (deltaTheta / 3);
        tangents.push({x: tx, y: ty});
      }

      let d = `M ${pts[0].x.toFixed(2)} ${pts[0].y.toFixed(2)}`;
      for (let i = 0; i < numPoints; i++) {
        const next = (i + 1) % numPoints;
        const cp1x = pts[i].x + tangents[i].x;
        const cp1y = pts[i].y + tangents[i].y;
        const cp2x = pts[next].x - tangents[next].x;
        const cp2y = pts[next].y - tangents[next].y;
        d += ` C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)}, ${cp2x.toFixed(2)} ${cp2y.toFixed(2)}, ${pts[next].x.toFixed(2)} ${pts[next].y.toFixed(2)}`;
      }
      d += ' Z';
      return d;
    };

    // 1. Circle / Squircle
    const dCircle = generatePath(() => 12);
    // 2. 5-point Rounded Pentagon / Flower (Image 3)
    const d5Gon = generatePath((th) => 11.5 + 2.8 * Math.cos(5 * th - Math.PI / 2));
    // 3. Angled Pebble / Oblong (Image 2 & 4)
    const dPebble = generatePath((th) => 11.5 + 3.4 * Math.cos(2 * th - 0.7));
    // 4. 8-point Scallop Flower (Image 5)
    const d8Scallop = generatePath((th) => 11.2 + 2.4 * Math.cos(8 * th));

    return {
      dCircle,
      d5Gon,
      dPebble,
      d8Scallop,
      morphValues: `${dCircle}; ${d5Gon}; ${dPebble}; ${d8Scallop}; ${dCircle}`,
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
        className={`m3-morph-svg ${colorClass} ${isPaused ? 'is-paused' : ''}`}
        fill="currentColor"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path d={paths.dCircle}>
          {!isPaused && (
            <animate
              attributeName="d"
              dur="8s"
              repeatCount="indefinite"
              values={paths.morphValues}
              keyTimes="0; 0.25; 0.5; 0.75; 1"
              calcMode="spline"
              keySplines="0.4 0 0.2 1; 0.4 0 0.2 1; 0.4 0 0.2 1; 0.4 0 0.2 1"
            />
          )}
        </path>
      </svg>
    </div>
  );
}
