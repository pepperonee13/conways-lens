import { ref, onMounted, onBeforeUnmount } from 'vue';

export function useGraphExport({ svgRef, detailSvgRef, detailRepoId, dims }) {
  const exportOpen    = ref(false);
  const exportDropRef = ref(null);

  function triggerDownload(url, filename) {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  async function exportAs(format) {
    exportOpen.value = false;
    const el = detailRepoId.value ? detailSvgRef.value : svgRef.value;
    if (!el) return;

    // Clone with white background rect + xmlns for standalone use
    const clone = el.cloneNode(true);
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bg.setAttribute('width', '100%');
    bg.setAttribute('height', '100%');
    bg.setAttribute('fill', '#ffffff');
    clone.insertBefore(bg, clone.firstChild);

    const svgStr = new XMLSerializer().serializeToString(clone);
    const stamp  = new Date().toISOString().slice(0, 10);
    const name   = `conways-lens-${stamp}`;

    if (format === 'svg') {
      const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
      const url  = URL.createObjectURL(blob);
      triggerDownload(url, `${name}.svg`);
      URL.revokeObjectURL(url);
      return;
    }

    // PNG at 2× for retina clarity
    const w = Number(el.getAttribute('width'))  || dims.w;
    const h = Number(el.getAttribute('height')) || dims.h;
    const canvas = document.createElement('canvas');
    canvas.width  = w * 2;
    canvas.height = h * 2;
    const ctx = canvas.getContext('2d');
    ctx.scale(2, 2);

    const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const img  = new Image();
    img.onload = () => {
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      triggerDownload(canvas.toDataURL('image/png'), `${name}.png`);
    };
    img.src = url;
  }

  function handleDocClick(e) {
    if (exportOpen.value && exportDropRef.value && !exportDropRef.value.contains(e.target))
      exportOpen.value = false;
  }

  onMounted(() => document.addEventListener('mousedown', handleDocClick));
  onBeforeUnmount(() => document.removeEventListener('mousedown', handleDocClick));

  return { exportOpen, exportDropRef, exportAs };
}
