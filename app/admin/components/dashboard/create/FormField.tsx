export default function FormField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className='mb-1 block text-sm font-medium text-gray-700'>
        {label}
      </label>
      {children}
    </div>
  );
}
