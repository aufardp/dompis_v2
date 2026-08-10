import { redirect } from 'next/navigation';

export default function ImportTiketLegacyRedirect() {
  redirect('/admin/tools/import-tiket');
}