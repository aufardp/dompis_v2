import Link from 'next/link';

export default function NotFound() {
  return (
    <div className='flex min-h-screen items-center justify-center bg-gray-50 px-4'>
      <div className='max-w-md text-center'>
        <h1 className='mb-4 text-9xl font-bold text-blue-600'>404</h1>
        <h2 className='mb-4 text-2xl font-semibold text-gray-800'>
          Halaman Tidak Ditemukan
        </h2>
        <p className='mb-8 text-gray-600'>
          Maaf, halaman yang Anda cari tidak tersedia.
        </p>
        <Link
          href='/'
          className='inline-block rounded-lg bg-blue-600 px-6 py-3 font-medium text-white hover:bg-blue-700'
        >
          Kembali ke Beranda
        </Link>
      </div>
    </div>
  );
}
