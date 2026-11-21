# shrink-image 🖼️

> Fast, client-side browser image compression and auto-resizing. Reduces 15MB phone camera uploads to under 300KB WebP files before uploading to your server or AWS S3.

[![npm version](https://img.shields.io/npm/v/shrink-image.svg)](https://www.npmjs.com/package/shrink-image)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Zero Dependencies](https://img.shields.io/badge/dependencies-0-brightgreen.svg)](#)

---

### The Problem It Solves

Modern phone cameras capture photos between 10MB and 25MB. When users upload avatars or photos:
- Slow cellular networks make uploads drag on for 30+ seconds.
- AWS S3 or Cloudinary storage costs skyrocket.
- Servers experience high memory spikes attempting to resize images on the backend.

`shrink-image` compresses and resizes the image directly inside the browser using HTML5 Canvas in **2 lines of code** before the network upload ever starts.

---

### Installation

```bash
npm install shrink-image
```

---

### Quick Start

```typescript
import { shrinkImage } from 'shrink-image';

async function handleFileUpload(event: Event) {
  const input = event.target as HTMLInputElement;
  const rawFile = input.files?.[0];
  if (!rawFile) return;

  // Compress from 15MB down to ~300KB
  const optimizedFile = await shrinkImage(rawFile, {
    maxSizeMB: 0.5,
    maxWidthOrHeight: 1280,
    outputType: 'image/webp',
    onProgress: (p) => console.log(`Compressing: ${p}%`)
  });

  // Ready to append to FormData or upload directly
  const formData = new FormData();
  formData.append('photo', optimizedFile);
  await fetch('/api/upload', { method: 'POST', body: formData });
}
```

---

### React Component Example

```tsx
import React, { useState } from 'react';
import { shrinkImage } from 'shrink-image';

export function AvatarUploader() {
  const [preview, setPreview] = useState<string | null>(null);
  const [compressing, setCompressing] = useState(false);

  const onChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setCompressing(true);
    try {
      const compressed = await shrinkImage(file, {
        maxSizeMB: 0.3,
        maxWidthOrHeight: 800,
        outputType: 'image/webp'
      });

      setPreview(URL.createObjectURL(compressed));
      // upload compressed file...
    } finally {
      setCompressing(false);
    }
  };

  return (
    <div>
      <input type="file" accept="image/*" onChange={onChange} />
      {compressing && <p>Optimizing image...</p>}
      {preview && <img src={preview} alt="Avatar Preview" width={200} />}
    </div>
  );
}
```

---

### Options Reference

| Option | Type | Default | Description |
| :--- | :---: | :---: | :--- |
| `maxSizeMB` | `number` | `1.0` | Target maximum size in MB. The algorithm iteratively optimizes quality to fit. |
| `maxWidthOrHeight` | `number` | `1920` | Maximum pixel width or height. Maintains original aspect ratio. |
| `initialQuality` | `number` | `0.8` | Initial compression quality from `0.1` to `1.0`. |
| `outputType` | `string` | `'image/webp'` | Target format: `'image/webp'`, `'image/jpeg'`, or `'image/png'`. |
| `onProgress` | `(p) => void` | `undefined` | Callback receiving progress from `0` to `100`. |

---

### License

MIT © [Mayuri Phad](https://github.com/mayuriphad)
