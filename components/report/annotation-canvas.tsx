"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import type { Annotation, Point } from "./annotation-types";

interface AnnotationCanvasProps {
  isActive: boolean;
  activeTool: string;
  annotations: Annotation[];
  currentAnnotation: Annotation | null;
  drawTick: number;
  onMouseDown: (point: Point) => void;
  onMouseMove: (point: Point) => void;
  onMouseUp: () => void;
  onTextPlace: (point: Point, text: string) => void;
  contentRef: React.RefObject<HTMLDivElement | null>;
}

function pointsToPath(points: Point[] | undefined): string {
  if (!points || points.length === 0) return "";
  let path = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    path += ` L ${points[i].x} ${points[i].y}`;
  }
  return path;
}

function getArrowHead(start: Point, end: Point): string {
  const angle = Math.atan2(end.y - start.y, end.x - start.x);
  const headLength = 15;
  const headAngle = Math.PI / 6;

  const x1 = end.x - headLength * Math.cos(angle - headAngle);
  const y1 = end.y - headLength * Math.sin(angle - headAngle);
  const x2 = end.x - headLength * Math.cos(angle + headAngle);
  const y2 = end.y - headLength * Math.sin(angle + headAngle);

  return `${end.x},${end.y} ${x1},${y1} ${x2},${y2}`;
}

function renderAnnotation(annotation: Annotation) {
  switch (annotation.type) {
    case "pen":
    case "highlighter":
      return (
        <path
          d={pointsToPath(annotation.points)}
          stroke={annotation.color}
          strokeWidth={annotation.strokeWidth}
          strokeOpacity={annotation.opacity}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      );

    case "circle": {
      if (!annotation.start || !annotation.end) return null;
      const cx = (annotation.start.x + annotation.end.x) / 2;
      const cy = (annotation.start.y + annotation.end.y) / 2;
      const rx = Math.abs(annotation.end.x - annotation.start.x) / 2;
      const ry = Math.abs(annotation.end.y - annotation.start.y) / 2;
      return (
        <ellipse
          cx={cx}
          cy={cy}
          rx={rx}
          ry={ry}
          stroke={annotation.color}
          strokeWidth={annotation.strokeWidth}
          strokeOpacity={annotation.opacity}
          fill="none"
        />
      );
    }

    case "rectangle": {
      if (!annotation.start || !annotation.end) return null;
      const x = Math.min(annotation.start.x, annotation.end.x);
      const y = Math.min(annotation.start.y, annotation.end.y);
      const width = Math.abs(annotation.end.x - annotation.start.x);
      const height = Math.abs(annotation.end.y - annotation.start.y);
      return (
        <rect
          x={x}
          y={y}
          width={width}
          height={height}
          stroke={annotation.color}
          strokeWidth={annotation.strokeWidth}
          strokeOpacity={annotation.opacity}
          fill="none"
        />
      );
    }

    case "arrow": {
      if (!annotation.start || !annotation.end) return null;
      return (
        <g>
          <line
            x1={annotation.start.x}
            y1={annotation.start.y}
            x2={annotation.end.x}
            y2={annotation.end.y}
            stroke={annotation.color}
            strokeWidth={annotation.strokeWidth}
            strokeOpacity={annotation.opacity}
          />
          <polygon
            points={getArrowHead(annotation.start, annotation.end)}
            fill={annotation.color}
            fillOpacity={annotation.opacity}
          />
        </g>
      );
    }

    case "text": {
      if (!annotation.start || !annotation.text) return null;
      return (
        <text
          x={annotation.start.x}
          y={annotation.start.y}
          fill={annotation.color}
          fontSize="16"
          fontFamily="sans-serif"
          fontWeight="600"
        >
          {annotation.text}
        </text>
      );
    }

    default:
      return null;
  }
}

export function AnnotationCanvas({
  isActive,
  activeTool,
  annotations,
  currentAnnotation,
  drawTick,
  onMouseDown,
  onMouseMove,
  onMouseUp,
  onTextPlace,
  contentRef,
}: AnnotationCanvasProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [svgHeight, setSvgHeight] = useState(0);
  const [textInput, setTextInput] = useState<{
    x: number;
    y: number;
    value: string;
  } | null>(null);

  // Resize observer to match SVG height to scroll content
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;

    const update = () => setSvgHeight(el.scrollHeight);
    update();

    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [contentRef]);

  const getPoint = useCallback(
    (e: React.MouseEvent): Point => {
      const svg = svgRef.current;
      if (!svg) return { x: 0, y: 0 };
      const rect = svg.getBoundingClientRect();
      const scrollContainer = contentRef.current;
      const scrollTop = scrollContainer?.scrollTop ?? 0;
      return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top + scrollTop,
      };
    },
    [contentRef]
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (!isActive) return;

      const point = getPoint(e);

      if (activeTool === "text") {
        setTextInput({ x: point.x, y: point.y, value: "" });
        return;
      }

      onMouseDown(point);
    },
    [isActive, activeTool, getPoint, onMouseDown]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isActive) return;
      onMouseMove(getPoint(e));
    },
    [isActive, getPoint, onMouseMove]
  );

  const handleMouseUp = useCallback(() => {
    if (!isActive) return;
    onMouseUp();
  }, [isActive, onMouseUp]);

  const handleTextConfirm = useCallback(() => {
    if (textInput && textInput.value.trim()) {
      onTextPlace(
        { x: textInput.x, y: textInput.y },
        textInput.value
      );
    }
    setTextInput(null);
  }, [textInput, onTextPlace]);

  const handleTextKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleTextConfirm();
      } else if (e.key === "Escape") {
        setTextInput(null);
      }
    },
    [handleTextConfirm]
  );

  // Suppress drawTick lint — it's used to force re-render
  void drawTick;

  return (
    <>
      <svg
        ref={svgRef}
        className={isActive ? "cursor-crosshair" : ""}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: svgHeight || "100%",
          pointerEvents: isActive ? "all" : "none",
          zIndex: isActive ? 50 : -1,
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {annotations.map((annotation) => (
          <g key={annotation.id}>{renderAnnotation(annotation)}</g>
        ))}

        {currentAnnotation && (
          <g>{renderAnnotation(currentAnnotation)}</g>
        )}
      </svg>

      {/* Text input overlay */}
      {textInput && (
        <input
          type="text"
          autoFocus
          value={textInput.value}
          onChange={(e) =>
            setTextInput((prev) =>
              prev ? { ...prev, value: e.target.value } : null
            )
          }
          onKeyDown={handleTextKeyDown}
          onBlur={handleTextConfirm}
          style={{
            position: "absolute",
            left: textInput.x,
            top: textInput.y - 20,
            zIndex: 60,
            background: "rgba(0,0,0,0.8)",
            color: "white",
            border: "1px solid #F5B800",
            borderRadius: 4,
            padding: "4px 8px",
            fontSize: 16,
            fontWeight: 600,
            outline: "none",
            minWidth: 120,
          }}
          placeholder="Type here..."
        />
      )}
    </>
  );
}
