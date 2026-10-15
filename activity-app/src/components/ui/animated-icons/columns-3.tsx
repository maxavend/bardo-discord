"use client";

import type { Transition, Variants } from "motion/react";
import { motion, useAnimation } from "motion/react";
import type { HTMLAttributes, MouseEvent } from "react";
import { forwardRef, useCallback, useImperativeHandle, useRef } from "react";

import { cn } from "@/lib/utils";

export interface Columns3IconHandle {
  startAnimation: () => void;
  stopAnimation: () => void;
}

interface Columns3IconProps extends HTMLAttributes<HTMLDivElement> {
  size?: number;
}

const DEFAULT_TRANSITION: Transition = {
  duration: 0.6,
  opacity: { duration: 0.2 },
};

// Mismo patrón que lucide-animated (no existe columns-3 en su registro):
// los divisores del tablero se trazan uno tras otro.
const PATH_VARIANTS: Variants = {
  normal: {
    pathLength: 1,
    opacity: 1,
  },
  animate: (index: number) => ({
    opacity: [0, 1],
    pathLength: [0, 1],
    transition: { ...DEFAULT_TRANSITION, delay: index * 0.12 },
  }),
};

const Columns3Icon = forwardRef<Columns3IconHandle, Columns3IconProps>(
  ({ onMouseEnter, onMouseLeave, className, size, ...props }, ref) => {
    const controls = useAnimation();
    const isControlledRef = useRef(false);

    useImperativeHandle(ref, () => {
      isControlledRef.current = true;

      return {
        startAnimation: () => controls.start("animate"),
        stopAnimation: () => controls.start("normal"),
      };
    });

    const handleMouseEnter = useCallback(
      (e: MouseEvent<HTMLDivElement>) => {
        if (isControlledRef.current) {
          onMouseEnter?.(e);
        } else {
          controls.start("animate");
        }
      },
      [controls, onMouseEnter]
    );

    const handleMouseLeave = useCallback(
      (e: MouseEvent<HTMLDivElement>) => {
        if (isControlledRef.current) {
          onMouseLeave?.(e);
        } else {
          controls.start("normal");
        }
      },
      [controls, onMouseLeave]
    );
    return (
      <div
        className={cn("inline-flex shrink-0 items-center justify-center select-none", !size && !className?.includes("size-") && "size-4", className)}
        style={size ? { width: size, height: size, ...props.style } : props.style}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        {...props}
      >
        <svg className="size-full shrink-0" data-slot="icon"
          fill="none"
          height={size}
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          viewBox="0 0 24 24"
          width={size}
          xmlns="http://www.w3.org/2000/svg"
        >
          <rect height="18" rx="2" width="18" x="3" y="3" />
          {["M9 3v18", "M15 3v18"].map((d, index) => (
            <motion.path
              animate={controls}
              custom={index}
              d={d}
              initial="normal"
              key={d}
              transition={DEFAULT_TRANSITION}
              variants={PATH_VARIANTS}
            />
          ))}
        </svg>
      </div>
    );
  }
);

Columns3Icon.displayName = "Columns3Icon";

export { Columns3Icon };
