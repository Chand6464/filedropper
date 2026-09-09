import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';

interface QRCodeBoxProps {
  url: string;
  size?: number;
}

export const QRCodeBox: React.FC<QRCodeBoxProps> = ({ url, size = 180 }) => {
  const [dataUrl, setDataUrl] = useState<string>('');
  const [error, setError] = useState(false);

  useEffect(() => {
    QRCode.toDataURL(url, {
      width: size,
      margin: 1,
      color: {
        dark: '#0f172a',
        light: '#ffffff',
      },
    })
      .then((url) => {
        setDataUrl(url);
        setError(false);
      })
      .catch((err) => {
        console.error('QR code generation failed:', err);
        setError(true);
      });
  }, [url, size]);

  if (error || !dataUrl) {
    return (
      <div
        style={{ width: size, height: size }}
        className="flex items-center justify-center bg-slate-800 rounded-xl text-slate-400 text-xs"
      >
        Generating QR...
      </div>
    );
  }

  return (
    <div className="p-2 bg-white rounded-xl shadow-lg inline-block border-2 border-slate-200">
      <img src={dataUrl} alt="Pairing QR Code" className="rounded block" width={size} height={size} />
    </div>
  );
};
