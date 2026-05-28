import React from "react";

const CIRCLE_GRADIENT: React.CSSProperties = {
  background: "linear-gradient(90deg, #00d4ff 0%, #3b82f6 45%, #7c3aed 75%, #d946ef 100%)",
  WebkitBackgroundClip: "text",
  WebkitTextFillColor: "transparent",
  backgroundClip: "text",
};

const iconHeights: Record<string, string> = {
  xs: "h-6",
  sm: "h-8",
  md: "h-10",
  lg: "h-12",
};

const textSizes: Record<string, string> = {
  xs: "text-sm",
  sm: "text-base",
  md: "text-xl",
  lg: "text-2xl",
};

/**
 * BrandMark — icon + "FundCircle" text for navbars, sidebars, headers.
 */
export function BrandMark({
  size = "md",
  className = "",
}: {
  size?: "xs" | "sm" | "md" | "lg";
  className?: string;
}) {
  return (
    <div className={`inline-flex items-center gap-2 shrink-0 ${className}`}>
      <img
        src="/fundcircle-logo-full.png"
        alt="FundCircle icon"
        className={`${iconHeights[size]} w-auto object-contain`}
        draggable={false}
      />
      <span className={`${textSizes[size]} font-extrabold tracking-tight leading-none`}>
        <span className="text-slate-900">Fund</span>
        <span style={CIRCLE_GRADIENT}>Circle</span>
      </span>
    </div>
  );
}

/**
 * BrandLogo — icon + large title for dark-background pages (auth, splash, onboarding).
 */
interface BrandLogoProps {
  size?: "sm" | "md" | "lg";
  className?: string;
}

const logoIconHeights: Record<string, string> = {
  sm: "h-14",
  md: "h-20",
  lg: "h-24",
};

const logoTextSizes: Record<string, string> = {
  sm: "text-3xl",
  md: "text-4xl",
  lg: "text-5xl",
};

export default function BrandLogo({ size = "md", className = "" }: BrandLogoProps) {
  return (
    <div className={`flex flex-col items-center gap-3 ${className}`}>
      <img
        src="/fundcircle-logo-full.png"
        alt="FundCircle"
        className={`${logoIconHeights[size]} w-auto object-contain`}
        draggable={false}
      />
      <span className={`${logoTextSizes[size]} font-black tracking-tight leading-none`}>
        <span className="text-white">Fund</span>
        <span style={CIRCLE_GRADIENT}>Circle</span>
      </span>
    </div>
  );
}
