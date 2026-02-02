"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import type { Tool, Annotation, Point } from "@/components/report/annotation-types";

interface AnnotationState {
  isActive: boolean;
  activeTool: Tool;
  color: string;
  strokeWidth: number;
  annotations: Annotation[];
  history: Annotation[][];
  historyIndex: number;
}

const INITIAL_STATE: AnnotationState = {
  isActive: false,
  activeTool: "pen",
  color: "#ef4444",
  strokeWidth: 2,
  annotations: [],
  history: [[]],
  historyIndex: 0,
};

export function useAnnotation() {
  const [state, setState] = useState<AnnotationState>(INITIAL_STATE);

  const isDrawing = useRef(false);
  const currentAnnotation = useRef<Annotation | null>(null);
  // Counter to force re-renders while drawing
  const [drawTick, setDrawTick] = useState(0);

  const startDrawing = useCallback(
    (point: Point) => {
      if (state.activeTool === "text") return; // text handled separately

      isDrawing.current = true;

      const isFreehand =
        state.activeTool === "pen" || state.activeTool === "highlighter";

      const newAnnotation: Annotation = {
        id: Date.now().toString(),
        type: state.activeTool,
        color: state.color,
        strokeWidth:
          state.activeTool === "highlighter" ? 20 : state.strokeWidth,
        opacity: state.activeTool === "highlighter" ? 0.4 : 1,
        points: isFreehand ? [point] : undefined,
        start: point,
        end: point,
      };

      currentAnnotation.current = newAnnotation;
      setDrawTick((t) => t + 1);
    },
    [state.activeTool, state.color, state.strokeWidth]
  );

  const continueDrawing = useCallback((point: Point) => {
    if (!isDrawing.current || !currentAnnotation.current) return;

    if (currentAnnotation.current.points) {
      currentAnnotation.current.points.push(point);
    } else {
      currentAnnotation.current.end = point;
    }

    setDrawTick((t) => t + 1);
  }, []);

  const endDrawing = useCallback(() => {
    if (!isDrawing.current || !currentAnnotation.current) return;

    isDrawing.current = false;
    const finished = currentAnnotation.current;
    currentAnnotation.current = null;

    setState((s) => {
      const newAnnotations = [...s.annotations, finished];
      const newHistory = s.history.slice(0, s.historyIndex + 1);
      newHistory.push(newAnnotations);

      return {
        ...s,
        annotations: newAnnotations,
        history: newHistory,
        historyIndex: newHistory.length - 1,
      };
    });
  }, []);

  const addTextAnnotation = useCallback(
    (point: Point, text: string) => {
      if (!text.trim()) return;

      const annotation: Annotation = {
        id: Date.now().toString(),
        type: "text",
        color: state.color,
        strokeWidth: state.strokeWidth,
        opacity: 1,
        start: point,
        text,
      };

      setState((s) => {
        const newAnnotations = [...s.annotations, annotation];
        const newHistory = s.history.slice(0, s.historyIndex + 1);
        newHistory.push(newAnnotations);

        return {
          ...s,
          annotations: newAnnotations,
          history: newHistory,
          historyIndex: newHistory.length - 1,
        };
      });
    },
    [state.color, state.strokeWidth]
  );

  const undo = useCallback(() => {
    setState((s) => {
      if (s.historyIndex <= 0) return s;
      const newIndex = s.historyIndex - 1;
      return {
        ...s,
        annotations: s.history[newIndex],
        historyIndex: newIndex,
      };
    });
  }, []);

  const redo = useCallback(() => {
    setState((s) => {
      if (s.historyIndex >= s.history.length - 1) return s;
      const newIndex = s.historyIndex + 1;
      return {
        ...s,
        annotations: s.history[newIndex],
        historyIndex: newIndex,
      };
    });
  }, []);

  const clearAll = useCallback(() => {
    if (!window.confirm("Clear all annotations?")) return;

    setState((s) => {
      const newHistory = s.history.slice(0, s.historyIndex + 1);
      newHistory.push([]);

      return {
        ...s,
        annotations: [],
        history: newHistory,
        historyIndex: newHistory.length - 1,
      };
    });
  }, []);

  const toggleAnnotationMode = useCallback(() => {
    setState((s) => ({ ...s, isActive: !s.isActive }));
  }, []);

  const setTool = useCallback((tool: Tool) => {
    setState((s) => ({ ...s, activeTool: tool }));
  }, []);

  const setColor = useCallback((color: string) => {
    setState((s) => ({ ...s, color }));
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    if (!state.isActive) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept if user is typing in an input
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return;

      if (e.key === "Escape") {
        toggleAnnotationMode();
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key === "z") {
        e.preventDefault();
        if (e.shiftKey) {
          redo();
        } else {
          undo();
        }
        return;
      }

      // Single-key tool shortcuts
      switch (e.key.toLowerCase()) {
        case "p":
          setTool("pen");
          break;
        case "h":
          setTool("highlighter");
          break;
        case "c":
          setTool("circle");
          break;
        case "r":
          setTool("rectangle");
          break;
        case "a":
          setTool("arrow");
          break;
        case "t":
          setTool("text");
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [state.isActive, toggleAnnotationMode, undo, redo, setTool]);

  return {
    isActive: state.isActive,
    activeTool: state.activeTool,
    color: state.color,
    strokeWidth: state.strokeWidth,
    annotations: state.annotations,
    historyIndex: state.historyIndex,
    historyLength: state.history.length,
    currentAnnotation: currentAnnotation.current,
    drawTick,
    startDrawing,
    continueDrawing,
    endDrawing,
    addTextAnnotation,
    undo,
    redo,
    clearAll,
    toggleAnnotationMode,
    setTool,
    setColor,
  };
}
