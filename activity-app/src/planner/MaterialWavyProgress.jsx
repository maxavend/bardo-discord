import {useMemo} from 'react';

/**
 * Material Design 3 Expressive Wavy Progress Indicator
 * Ported from Material 3 (Squiggly / Wavy Progress) specification for React.
 * Uses 1:1 pixel coordinates to prevent SVG scaling distortion and ensure
 * exact matching thickness with the background rail and smooth calm frequency.
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
  const progressClamped = Math.min(100, Math.max(0, value));

  // Generate cubic Bézier approximation of sine wave in 1:1 pixel coordinates
  const wavePathData = useMemo(() => {
    const totalPeriods = 20; // 20 * 72px = 1440px height coverage
    const cx = 10;
    let d = `M ${cx} 0`;

    for (let i = 0; i < totalPeriods; i++) {
      const y0 = i * wavelength;
      const cpDist = amplitude * 1.35;
      // First half-cycle (crest)
      d += ` C ${cx + cpDist} ${y0 + wavelength * 0.17}, ${cx + cpDist} ${y0 + wavelength * 0.33}, ${cx} ${y0 + wavelength * 0.5}`;
      // Second half-cycle (trough)
      d += ` C ${cx - cpDist} ${y0 + wavelength * 0.67}, ${cx - cpDist} ${y0 + wavelength * 0.83}, ${cx} ${y0 + wavelength}`;
    }
    return d;
  }, [wavelength, amplitude]);

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
      role="progressbar"
      aria-valuenow={progressClamped}
      aria-valuemin={0}
      aria-valuemax={100}
      className={`m3-wavy-progress-root ${orientation} ${isPaused ? 'is-paused' : ''} ${className}`}
      aria-hidden="true"
    >
      {/* Background Track (Inactive Gray Rail - 4.5px) */}
      <div className="m3-wavy-bg-track" />

      {/* Active Animated Wavy Progress Fill */}
      <div
        className="m3-wavy-fill-container"
        style={{
          height: orientation === 'vertical' ? `${progressClamped}%` : '100%',
          width: orientation === 'horizontal' ? `${progressClamped}%` : '100%',
        }}
      >
        <svg
          className={`m3-wavy-svg ${colorClass}`}
          width="20"
          height="1440"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d={wavePathData}
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>

      {/* Terminal Stop Dot at bottom of track */}
      {showStopDot && progressClamped < 96 && (
        <div className="m3-wavy-stop-dot" />
      )}
    </div>
  );
}

