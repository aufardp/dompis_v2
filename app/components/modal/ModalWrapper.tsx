'use client';

import { ReactNode, useEffect, useState } from 'react';

interface Props {
  children: ReactNode;
  onClose: () => void;
}

export default function ModalWrapper({ children, onClose }: Props) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    setTimeout(() => setShow(true), 10);
  }, []);

  return (
    <div
      onClick={onClose}
      className={`fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 transition-opacity duration-300 ${
        show ? 'opacity-100' : 'opacity-0'
      }`}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`w-full max-w-2xl transform rounded-2xl bg-white shadow-2xl transition-all duration-300 ${
          show ? 'translate-y-0 scale-100' : 'translate-y-10 scale-95'
        }`}
      >
        {children}
      </div>
    </div>
  );
}
