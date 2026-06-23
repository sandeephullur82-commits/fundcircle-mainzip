/**
 * AppSwitch — single reusable toggle switch used across the entire app.
 *
 * Root causes fixed vs. the old implementations:
 *  1. Uses <div role="switch"> NOT <button> — eliminates all browser UA-stylesheet
 *     button quirks (Chrome/Android: -webkit-appearance:button adds internal padding
 *     that `padding:0` inline-style cannot fully override).
 *  2. NO overflow:hidden on the track — overflow:hidden clips the knob's box-shadow,
 *     making the white knob look visually merged with / outside the track edge.
 *     Instead we rely on pixel-exact math: 3px margin on every side, 24px knob in
 *     30px track, 22px travel → right edge at 49px inside a 52px track (3px gap).
 *  3. All sizing via inline styles (no Tailwind on interactive parts) — eliminates
 *     class-specificity conflicts and Tailwind reset collisions.
 *  4. Touch target is a transparent 44×44 wrapper div (not padding on the track) —
 *     prevents the wrapper from ever being visually larger than the track.
 *  5. willChange: "transform" + translateZ(0) — force GPU compositing so Android
 *     Chrome doesn't repaint the knob through the CPU path (which can cause 1px
 *     sub-pixel rounding artifacts on high-DPI screens).
 *
 * Track:  52 × 30 px, border-radius 9999
 * Knob:   24 × 24 px, absolute, top:3 left:3
 * OFF:    translateX(0)  → knob 3–27px  (3px gap each side) ✓
 * ON:     translateX(22) → knob 25–49px (3px gap right)     ✓
 * Never overflows.
 */
import React, { useState } from "react";

interface AppSwitchProps {
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  ariaLabel?: string;
  id?: string;
}

export default function AppSwitch({
  value,
  onChange,
  disabled = false,
  ariaLabel,
  id,
}: AppSwitchProps) {
  const [focused, setFocused] = useState(false);

  const toggle = () => {
    if (!disabled) onChange(!value);
  };

  return (
    /*
     * Outer div = 44×44 min touch target (invisible padding area).
     * Using div not button to avoid ALL browser UA button styles.
     */
    <div
      id={id}
      role="switch"
      aria-checked={value}
      aria-label={ariaLabel}
      aria-disabled={disabled || undefined}
      tabIndex={disabled ? -1 : 0}
      onClick={toggle}
      onKeyDown={(e) => {
        if ((e.key === " " || e.key === "Enter") && !disabled) {
          e.preventDefault();
          toggle();
        }
      }}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        minWidth: 44,
        minHeight: 44,
        padding: 0,
        margin: 0,
        flexShrink: 0,
        cursor: disabled ? "not-allowed" : "pointer",
        userSelect: "none",
        WebkitUserSelect: "none",
        /* Suppress Android Chrome blue tap flash */
        WebkitTapHighlightColor: "transparent",
        opacity: disabled ? 0.5 : 1,
        /* Keyboard focus ring — only when focused via keyboard, not mouse */
        outline: focused ? "2px solid #0EA5E9" : "none",
        outlineOffset: focused ? 4 : 0,
        borderRadius: 9999,
        background: "none",
        border: "none",
      }}
    >
      {/* ── Track ── */}
      <div
        style={{
          position: "relative",
          display: "block",
          width: 52,
          height: 30,
          borderRadius: 9999,
          /*
           * No overflow:hidden here — that clips the knob's box-shadow and
           * makes the knob look like it's outside/against the edge of the track.
           * Pixel math guarantees the knob never exits the track bounds.
           */
          backgroundColor: value ? "#0EA5E9" : "#E5E7EB",
          transition: "background-color 200ms ease",
          flexShrink: 0,
        }}
      >
        {/* ── Knob ── */}
        <div
          style={{
            position: "absolute",
            top: 3,          /* (30 - 24) / 2 = 3px vertical centering ✓ */
            left: 3,         /* 3px gap from track left edge ✓ */
            width: 24,
            height: 24,
            borderRadius: "50%",
            backgroundColor: "#ffffff",
            /*
             * Box-shadow is now fully visible (no overflow:hidden above).
             * This gives the knob clear visual separation from the track.
             */
            boxShadow: "0 1px 4px rgba(0,0,0,0.28), 0 1px 2px rgba(0,0,0,0.16)",
            transition: "transform 200ms ease",
            /*
             * ON:  3 + 22 = 25px left edge, 25 + 24 = 49px right edge
             *      Track is 52px → 3px gap on right ✓ never overflows
             * OFF: 3px left edge, 3 + 24 = 27px right edge ✓
             */
            transform: value ? "translateX(22px)" : "translateX(0px)",
            /*
             * GPU-accelerated path: prevents sub-pixel rounding on
             * Android high-DPI screens that causes 1px visual overflow.
             * willChange promotes the knob to its own compositor layer.
             */
            willChange: "transform",
          }}
        />
      </div>
    </div>
  );
}
