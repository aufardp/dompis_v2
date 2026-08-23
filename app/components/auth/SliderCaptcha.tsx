'use client';
import React, { useState } from 'react';

export type SliderCaptchaChallenge = {
  challengeId: string;
  backgroundImage: string;
  pieceImage: string;
  pieceY: number;
  trackWidth: number;
  imageHeight: number;
  pieceWidth: number;
  pieceHeight: number;
};

export default function SliderCaptcha({
  challenge,
  error,
  loading,
  onSubmit,
}: {
  challenge: SliderCaptchaChallenge;
  error?: string;
  loading?: boolean;
  onSubmit: (sliderX: number) => void;
}) {
  const maxX = challenge.trackWidth - challenge.pieceWidth;
  const [sliderX, setSliderX] = useState(0);

  return (
    <div className='mx-auto flex flex-col items-center space-y-3' style={{ width: challenge.trackWidth, maxWidth: '100%' }}>
      <p className='text-center text-sm font-medium text-gray-700 dark:text-gray-300'>
        Geser potongan gambar ke posisi yang pas
      </p>

      <div
        className='relative mx-auto overflow-hidden rounded-xl border border-gray-200 dark:border-gray-600'
        style={{ width: challenge.trackWidth, height: challenge.imageHeight }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={challenge.backgroundImage}
          alt='Captcha'
          width={challenge.trackWidth}
          height={challenge.imageHeight}
          className='pointer-events-none absolute top-0 left-0 select-none'
        />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={challenge.pieceImage}
          alt=''
          width={challenge.pieceWidth}
          height={challenge.pieceHeight}
          className='pointer-events-none absolute select-none'
          style={{ left: sliderX, top: challenge.pieceY }}
        />
      </div>

      <input
        type='range'
        min={0}
        max={maxX}
        value={sliderX}
        disabled={loading}
        onChange={(e) => setSliderX(Number(e.target.value))}
        onMouseUp={() => onSubmit(sliderX)}
        onTouchEnd={() => onSubmit(sliderX)}
        onKeyUp={() => onSubmit(sliderX)}
        className='block w-full accent-blue-600'
      />

      {error && <p className='text-center text-sm text-red-600'>{error}</p>}
      {loading && (
        <p className='text-center text-sm text-gray-500 dark:text-gray-400'>Memverifikasi...</p>
      )}
    </div>
  );
}
