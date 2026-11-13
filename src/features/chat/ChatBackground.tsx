import { useEffect, useRef } from 'react';

export function ChatBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvasEl = canvasRef.current;
    if (!canvasEl) return;
    const ctxEl = canvasEl.getContext('2d');
    if (!ctxEl) return;
    const canvas = canvasEl;
    const ctx = ctxEl;

    let animationId: number;
    let width = 0;
    let height = 0;
    let time = 0;
    const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
    let reduceMotion = motionPreference.matches;

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (reduceMotion) draw();
    }

    function getPalette(): { bg: string; colors: [string, string, string, string, string] } {
      const isDark = document.documentElement.classList.contains('dark');
      return isDark
        ? {
            bg: '#091321',
            // Use the workspace's blue palette in both themes.
            colors: [
              'rgba(96, 165, 250, 0.42)',
              'rgba(59, 130, 246, 0.38)',
              'rgba(56, 189, 248, 0.32)',
              'rgba(96, 165, 250, 0.28)',
              'rgba(59, 130, 246, 0.24)',
            ],
          }
        : {
            bg: '#f5f8fc',
            colors: [
              'rgba(37, 99, 235, 0.36)',
              'rgba(59, 130, 246, 0.32)',
              'rgba(14, 165, 233, 0.28)',
              'rgba(37, 99, 235, 0.24)',
              'rgba(59, 130, 246, 0.2)',
            ],
          };
    }

    function drawWave(
      yBase: number,
      amplitude: number,
      frequency: number,
      speed: number,
      color: string,
      lineWidth: number,
      phase: number
    ) {
      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth;
      for (let x = 0; x <= width; x += 2) {
        const y =
          yBase +
          Math.sin(x * frequency + time * speed + phase) * amplitude +
          Math.sin(x * frequency * 0.5 + time * speed * 1.2 + phase * 0.5) * amplitude * 0.35;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    function drawRibbon(
      yBase: number,
      amplitude: number,
      frequency: number,
      speed: number,
      color: string,
      lineWidth: number,
      phase: number,
      layers: number
    ) {
      for (let i = 0; i < layers; i++) {
        const offset = (i - layers / 2) * (amplitude * 0.18);
        const alphaFactor = 1 - Math.abs(i - layers / 2) / (layers / 2 + 1);
        const alpha = parseFloat(color.slice(color.lastIndexOf(',') + 1, -1)) * alphaFactor;
        const layerColor = color.replace(/[\d.]+\)$/, `${alpha.toFixed(3)})`);
        drawWave(yBase + offset, amplitude, frequency, speed, layerColor, lineWidth, phase + i * 0.7);
      }
    }

    function draw() {
      const palette = getPalette();
      ctx.clearRect(0, 0, width, height);

      // Soft fade only at the very top and bottom edges, so the waves stay visible across the page.
      const fadeGradient = ctx.createLinearGradient(0, 0, 0, height);
      fadeGradient.addColorStop(0, palette.bg + 'b0');
      fadeGradient.addColorStop(0.14, palette.bg + '00');
      fadeGradient.addColorStop(0.86, palette.bg + '00');
      fadeGradient.addColorStop(1, palette.bg + '90');

      // Composite: draw waves first, then cover with fade gradient.
      drawRibbon(height * 0.32, height * 0.13, 0.004, 0.35, palette.colors[0], 1.25, 0, 8);
      drawRibbon(height * 0.44, height * 0.11, 0.005, 0.45, palette.colors[1], 1.25, 2.1, 8);
      drawRibbon(height * 0.56, height * 0.09, 0.006, 0.55, palette.colors[2], 1.25, 4.2, 8);
      drawRibbon(height * 0.66, height * 0.07, 0.0075, 0.4, palette.colors[3], 1, 1.3, 8);
      drawRibbon(height * 0.74, height * 0.05, 0.009, 0.3, palette.colors[4], 1, 3.4, 6);

      // Soft top glow (very subtle)
      const glow = ctx.createRadialGradient(width * 0.5, height * 0.25, 0, width * 0.5, height * 0.25, width * 0.7);
      glow.addColorStop(0, palette.colors[1].replace(/[\d.]+\)$/, '0.12)'));
      glow.addColorStop(0.7, palette.colors[1].replace(/[\d.]+\)$/, '0.04)'));
      glow.addColorStop(1, palette.bg + '00');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, width, height);

      // Apply the vertical fade overlay.
      ctx.fillStyle = fadeGradient;
      ctx.fillRect(0, 0, width, height);

      if (!reduceMotion) {
        time += 0.008;
        animationId = requestAnimationFrame(draw);
      }
    }

    function handleMotionPreferenceChange(event: MediaQueryListEvent) {
      reduceMotion = event.matches;
      cancelAnimationFrame(animationId);
      time = 0;
      draw();
    }

    resize();
    draw();

    window.addEventListener('resize', resize);
    motionPreference.addEventListener('change', handleMotionPreferenceChange);
    const observer = new MutationObserver(() => {
      if (reduceMotion) draw();
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener('resize', resize);
      motionPreference.removeEventListener('change', handleMotionPreferenceChange);
      observer.disconnect();
    };
  }, []);

  return (
    <div className="chat-background">
      <canvas ref={canvasRef} />
    </div>
  );
}
