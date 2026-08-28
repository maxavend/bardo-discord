import {useMemo} from 'react';

/**
 * Material Design 3 Expressive State Morph Glyph
 * - PLAY MODE: Morphs smoothly between organic Play-inspired shapes (rounded play triangle,
 *   3-lobe Reuleaux play badge, squircle) with gentle rotation.
 * - PAUSE MODE: Smoothly splits/divides into the two iconic rounded pause bars (||) with spring physics.
 * - RESUME: The two pause bars fuse seamlessly back into the play morphing shape.
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
    const numPoints = 18;

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

    // 1. Rounded Play Triangle (Pointing right)
    const dPlayTri = generatePath((th) => 11.2 + 3.8 * Math.cos(3 * th));
    // 2. 3-lobe Organic Reuleaux Play Badge
    const dReuleaux = generatePath((th) => 11.5 + 2.6 * Math.cos(3 * th + 0.4));
    // 3. Rounded Play Squircle
    const dSquircle = generatePath((th) => 11.6 + 1.8 * Math.cos(4 * th));
    // 4. Chevron Play Fast-Forward Morph
    const dChevron = generatePath((th) => 11.0 + 3.2 * Math.cos(3 * th - 0.3));

    return {
      dPlayTri,
      dReuleaux,
      dSquircle,
      dChevron,
      morphValues: `${dPlayTri}; ${dReuleaux}; ${dSquircle}; ${dChevron}; ${dPlayTri}`,
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

  // Frecuencia dinámica: Aumenta velocidad cuando se acaba el tiempo (<5m o overtime)
  const morphDuration = color === 'danger' ? '1.6s' : color === 'warning' ? '3.2s' : '7s';
  const rotationDuration = color === 'danger' ? '3s' : color === 'warning' ? '6s' : '14s';

  return (
    <div
      className={`relative flex items-center justify-center select-none ${colorClass} ${className}`}
      style={{width: size, height: size}}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 32 32"
        width={size}
        height={size}
        className="overflow-visible"
        fill="currentColor"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* ── Capa 1: Forma Play Morphing (Activa en reproducción) ─────────── */}
        <g
          className="m3-morph-play-container"
          style={{
            opacity: isPaused ? 0 : 1,
            transform: isPaused ? 'scale(0.3) rotate(-30deg)' : 'scale(1) rotate(0deg)',
            transformOrigin: 'center center',
            transition: 'transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.22s ease-out',
          }}
        >
          <path
            d={paths.dPlayTri}
            className="m3-morph-svg"
            style={{
              animationDuration: rotationDuration,
              animationPlayState: isPaused ? 'paused' : 'running',
            }}
          >
            {!isPaused && (
              <animate
                attributeName="d"
                dur={morphDuration}
                repeatCount="indefinite"
                values={paths.morphValues}
                keyTimes="0; 0.25; 0.5; 0.75; 1"
                calcMode="spline"
                keySplines="0.4 0 0.2 1; 0.4 0 0.2 1; 0.4 0 0.2 1; 0.4 0 0.2 1"
              />
            )}
          </path>
        </g>

        {/* ── Capa 2: Barra Izquierda de Pausa (Divide y expande a la izquierda) */}
        <rect
          x="6.5"
          y="6.5"
          width="5.5"
          height="19"
          rx="2.75"
          style={{
            opacity: isPaused ? 1 : 0,
            transform: isPaused ? 'translateX(0) scaleY(1)' : 'translateX(4px) scale(0.2)',
            transformOrigin: 'center center',
            transition: 'transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.22s ease-out',
          }}
        />

        {/* ── Capa 3: Barra Derecha de Pausa (Divide y expande a la derecha) ──── */}
        <rect
          x="20"
          y="6.5"
          width="5.5"
          height="19"
          rx="2.75"
          style={{
            opacity: isPaused ? 1 : 0,
            transform: isPaused ? 'translateX(0) scaleY(1)' : 'translateX(-4px) scale(0.2)',
            transformOrigin: 'center center',
            transition: 'transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.22s ease-out',
          }}
        />
      </svg>
    </div>
  );
}
