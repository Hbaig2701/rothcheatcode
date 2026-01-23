/**
 * Chart capture utility for converting Recharts components to base64 PNG images
 * Used for PDF generation where charts need to be embedded as images
 */

import { RefObject } from 'react';
import { toPng } from 'html-to-image';

/**
 * Capture a chart container element as a base64 PNG string
 * Waits briefly for animations to complete before capturing
 *
 * @param chartRef - React ref to the chart container div
 * @param options - Optional configuration for image capture
 * @returns Promise<string | null> - Base64 data URL or null if capture fails
 */
export async function captureChartAsBase64(
  chartRef: RefObject<HTMLDivElement | null>,
  options?: {
    quality?: number;
    pixelRatio?: number;
    backgroundColor?: string;
    delay?: number;
  }
): Promise<string | null> {
  const {
    quality = 0.95,
    pixelRatio = 2,
    backgroundColor = '#ffffff',
    delay = 200,
  } = options || {};

  if (!chartRef.current) {
    console.warn('Chart ref is not available');
    return null;
  }

  try {
    // Wait for animations to complete
    await new Promise(resolve => setTimeout(resolve, delay));

    const dataUrl = await toPng(chartRef.current, {
      quality,
      pixelRatio, // Higher resolution for PDF
      backgroundColor,
      cacheBust: true,
      // Skip elements that might cause issues
      filter: (node: HTMLElement) => {
        // Skip any hidden elements or elements with display:none
        if (node.style?.display === 'none') return false;
        // Skip tooltip elements that might be positioned off-screen
        if (node.classList?.contains('recharts-tooltip-wrapper')) return false;
        return true;
      },
    });

    return dataUrl;
  } catch (error) {
    console.error('Chart capture error:', error);
    return null;
  }
}

/**
 * Capture multiple charts as base64 images
 * Processes charts sequentially to avoid memory issues
 *
 * @param chartRefs - Object containing named refs to chart containers
 * @returns Promise<Record<string, string | null>> - Object with chart names and their base64 data
 */
export async function captureMultipleCharts(
  chartRefs: Record<string, RefObject<HTMLDivElement | null>>
): Promise<Record<string, string | null>> {
  const results: Record<string, string | null> = {};

  // Process charts sequentially to avoid overwhelming the browser
  for (const [name, ref] of Object.entries(chartRefs)) {
    if (ref?.current) {
      results[name] = await captureChartAsBase64(ref);
    } else {
      results[name] = null;
    }
  }

  return results;
}

/**
 * Alternative method using SVG serialization for Recharts
 * This can be more reliable for complex charts
 *
 * @param chartRef - React ref to the chart container
 * @returns Promise<string | null> - Base64 PNG data URL
 */
export async function captureChartFromSVG(
  chartRef: RefObject<HTMLDivElement | null>
): Promise<string | null> {
  if (!chartRef.current) {
    return null;
  }

  try {
    // Find the SVG element within the Recharts container
    const svg = chartRef.current.querySelector('svg');
    if (!svg) {
      console.warn('No SVG found in chart container');
      return null;
    }

    // Get SVG dimensions
    const svgRect = svg.getBoundingClientRect();
    const width = svgRect.width || 800;
    const height = svgRect.height || 400;

    // Serialize SVG to string
    const svgData = new XMLSerializer().serializeToString(svg);

    // Create a blob from SVG data
    const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);

    // Create canvas and draw SVG
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      URL.revokeObjectURL(url);
      return null;
    }

    // Set canvas size (2x for better quality)
    const scale = 2;
    canvas.width = width * scale;
    canvas.height = height * scale;
    ctx.scale(scale, scale);

    // Fill white background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Load and draw image
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0, width, height);
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL('image/png', 0.95));
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(null);
      };
      img.src = url;
    });
  } catch (error) {
    console.error('SVG capture error:', error);
    return null;
  }
}
