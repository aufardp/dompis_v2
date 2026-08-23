'use client';
import Image from 'next/image';
import { EyeOff, Eye } from 'lucide-react';
import React, { useState } from 'react';
import SliderCaptcha, { SliderCaptchaChallenge } from './SliderCaptcha';

async function redirectAfterLogin(role: string, needsAttendanceCheck: boolean) {
  if (typeof window !== 'undefined') {
    window.sessionStorage.setItem(
      'dompis:last-successful-login-at',
      String(Date.now()),
    );
  }

  // Give the browser a moment to persist HttpOnly auth cookies before
  // navigating into protected routes.
  await new Promise((resolve) => setTimeout(resolve, 800));

  if (role === 'superadmin') {
    window.location.replace('/admin');
  } else if (role === 'admin' || role === 'senior_leader' || role === 'admin_branch') {
    window.location.replace('/admin');
  } else if (role === 'teknisi') {
    if (needsAttendanceCheck) {
      window.location.replace('/teknisi/attendance');
    } else {
      window.location.replace('/teknisi');
    }
  } else if (role === 'helpdesk') {
    window.location.replace('/helpdesk');
  } else {
    window.location.replace('/');
  }
}

export default function LoginForm() {
  const [showPassword, setShowPassword] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [captchaChallenge, setCaptchaChallenge] =
    useState<SliderCaptchaChallenge | null>(null);
  const [captchaError, setCaptchaError] = useState('');
  const [captchaLoading, setCaptchaLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password, remember: rememberMe }),
      });

      const data = await res.json();

      if (res.ok && data.requiresCaptcha) {
        setCaptchaChallenge({
          challengeId: data.challengeId,
          backgroundImage: data.backgroundImage,
          pieceImage: data.pieceImage,
          pieceY: data.pieceY,
          trackWidth: data.trackWidth,
          imageHeight: data.imageHeight,
          pieceWidth: data.pieceWidth,
          pieceHeight: data.pieceHeight,
        });
      } else if (res.ok) {
        await redirectAfterLogin(data.role, data.needsAttendanceCheck);
      } else {
        setError(data.message || 'Login failed');
      }
    } catch (err) {
      setError('An error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleCaptchaSubmit = async (sliderX: number) => {
    if (!captchaChallenge) return;
    setCaptchaLoading(true);
    setCaptchaError('');

    try {
      const res = await fetch('/api/auth/login/verify-captcha', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          challengeId: captchaChallenge.challengeId,
          sliderX,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        await redirectAfterLogin(data.role, data.needsAttendanceCheck);
        return;
      }

      setCaptchaError(data.message || 'Captcha tidak sesuai, coba lagi.');
      if (data.requiresCaptcha) {
        setCaptchaChallenge({
          challengeId: data.challengeId,
          backgroundImage: data.backgroundImage,
          pieceImage: data.pieceImage,
          pieceY: data.pieceY,
          trackWidth: data.trackWidth,
          imageHeight: data.imageHeight,
          pieceWidth: data.pieceWidth,
          pieceHeight: data.pieceHeight,
        });
      } else {
        setCaptchaChallenge(null);
      }
    } catch (err) {
      setCaptchaError('Terjadi kesalahan. Silakan login ulang.');
      setCaptchaChallenge(null);
    } finally {
      setCaptchaLoading(false);
    }
  };

  return (
    <div className='flex min-h-screen'>
      <div className='relative hidden w-1/2 flex-col justify-between overflow-hidden p-12 text-white lg:flex'>
        {/* Background Image */}
        <div
          className='absolute inset-0 bg-cover bg-center bg-no-repeat'
          style={{ backgroundImage: "url('/assets/bg-log.webp')" }}
        />

        {/* Overlay gelap agar teks tetap terbaca */}
        <div className='absolute inset-0 bg-black/50' />

        {/* Konten di atas overlay */}
        <div className='relative z-10 flex items-center gap-2'>
          <Image
            src='/assets/logo.webp'
            alt='Dompis Logo'
            className='h-10 w-auto'
            width={40}
            height={40}
          />
          <h1 className='text-3xl font-bold'>Dompis</h1>
        </div>

        <div className='relative z-10'>
          <h2 className='mb-6 text-4xl leading-snug font-bold'>
            Manage Your Work <br /> Smarter & Faster
          </h2>
          <p className='max-w-md text-blue-100'>
            Track tickets, manage workflow, and monitor progress in one modern
            dashboard system.
          </p>
        </div>

        <div className='relative z-10 text-sm text-blue-200'>
          © {new Date().getFullYear()} Dompis. All rights reserved.
        </div>
      </div>

      <div className='flex flex-1 items-center justify-center bg-gray-50 px-6 py-12 dark:bg-gray-900'>
        <div className='w-full max-w-md'>
          <div className='rounded-2xl bg-white p-8 shadow-xl dark:bg-gray-800'>
            <div className='mb-2 flex justify-center'>
              <Image
                src='/assets/logo.webp'
                alt='Dompis Logo'
                className='h-16 w-auto'
                width={64}
                height={64}
              />
            </div>
            <div className='mb-8 text-center'>
              <h2 className='text-2xl font-bold text-gray-800 dark:text-white'>
                Welcome Back
              </h2>
              <p className='text-sm text-gray-500 dark:text-gray-400'>
                Please sign in to your account
              </p>
            </div>

            {captchaChallenge ? (
              <SliderCaptcha
                challenge={captchaChallenge}
                error={captchaError}
                loading={captchaLoading}
                onSubmit={handleCaptchaSubmit}
              />
            ) : (
              <form className='space-y-6' onSubmit={handleSubmit}>
                {error && (
                  <div className='rounded-lg bg-red-50 p-3 text-sm text-red-600'>
                    {error}
                  </div>
                )}

                <div>
                  <label className='mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300'>
                    Username
                  </label>
                  <input
                    type='text'
                    placeholder='Username'
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className='w-full rounded-xl border px-4 py-3 focus:ring-2 focus:ring-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700'
                    required
                  />
                </div>

                <div>
                  <label className='mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300'>
                    Password
                  </label>
                  <div className='relative'>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      placeholder='Enter your password'
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className='w-full rounded-xl border px-4 py-3 focus:ring-2 focus:ring-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700'
                      required
                    />
                    <button
                      type='button'
                      onClick={() => setShowPassword(!showPassword)}
                      className='absolute top-1/2 right-4 -translate-y-1/2 text-gray-400 hover:text-gray-600'
                    >
                      {showPassword ? (
                        <EyeOff className='h-5 w-5' />
                      ) : (
                        <Eye className='h-5 w-5' />
                      )}
                    </button>
                  </div>
                </div>

                <div className='flex items-center justify-between text-sm'>
                  <label className='flex items-center gap-2 text-gray-600 dark:text-gray-400'>
                    <input
                      type='checkbox'
                      className='rounded'
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                    />
                    Remember me
                  </label>

                  {/* <Link
                    href='/reset-password'
                    className='text-blue-600 hover:underline'
                  >
                    Forgot password?
                  </Link> */}
                </div>

                <button
                  type='submit'
                  disabled={loading}
                  className='w-full rounded-xl bg-blue-600 py-3 font-medium text-white transition hover:bg-blue-700 disabled:opacity-50'
                >
                  {loading ? 'Signing in...' : 'Sign In'}
                </button>
              </form>
            )}

            {/* <div className='mt-6 text-center text-sm text-gray-600 dark:text-gray-400'>
              Don't have an account?{' '}
              <Link href='/register' className='text-blue-600 hover:underline'>
                Sign Up
              </Link>
            </div> */}
          </div>
        </div>
      </div>
    </div>
  );
}
