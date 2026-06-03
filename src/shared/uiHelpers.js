/**
 * Shared UI Helpers & Utilities
 */

/**
 * Displays a non-blocking toast message on screen.
 */
export function showToast(message, type = 'success') {
    const existing = document.getElementById('siteToast');
    if (existing) existing.remove();
    const toast = document.createElement('div');
    toast.id = 'siteToast';
    toast.innerHTML = message;
    const colors = { success: '#2a9d8f', error: '#e63946', info: 'var(--accent-gold)' };
    Object.assign(toast.style, {
        position: 'fixed', bottom: '28px', left: '50%', transform: 'translateX(-50%)',
        background: colors[type] || colors.success, color: '#fff', padding: '12px 28px',
        borderRadius: '30px', fontFamily: 'inherit', fontSize: '0.9rem', fontWeight: '600',
        zIndex: '99999', boxShadow: '0 8px 30px rgba(0,0,0,0.35)',
        transition: 'opacity 0.4s', opacity: '0', whiteSpace: 'nowrap'
    });
    document.body.appendChild(toast);
    requestAnimationFrame(() => { toast.style.opacity = '1'; });
    setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 400); }, 3000);
}

/** 
 * Compresses an image file locally to save bandwidth.
 */
export async function compressImage(file, maxWidth = 300) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const scale = maxWidth / img.width;
                if (scale < 1) {
                    canvas.width = maxWidth;
                    canvas.height = img.height * scale;
                } else {
                    canvas.width = img.width;
                    canvas.height = img.height;
                }
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                canvas.toBlob((blob) => {
                    resolve(new File([blob], file.name, { type: 'image/jpeg' }));
                }, 'image/jpeg', 0.85);
            };
        };
    });
}

/**
 * Returns a new Date object locked to Chetumal time (UTC-5).
 */
export function getChetumalDate() {
    const now = new Date();
    const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    return new Date(utc + (3600000 * -5));
}

/**
 * Formats a Date object as YYYY-MM-DD string.
 */
export function getISOFromDate(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
