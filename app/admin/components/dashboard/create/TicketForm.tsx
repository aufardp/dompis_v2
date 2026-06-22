import FormField from './FormField';

export default function TicketForm({ formData, handleChange, areas, disabled }: any) {
  return (
    <div className='space-y-5'>
      <div className='grid gap-4 md:grid-cols-2'>
        <FormField label='Contact Name *'>
          <input
            name='contactName'
            value={formData.contactName}
            onChange={handleChange}
            disabled={disabled}
            required
            className='input'
          />
        </FormField>

        <FormField label='Contact Phone *'>
          <input
            name='contactPhone'
            value={formData.contactPhone}
            onChange={handleChange}
            disabled={disabled}
            required
            className='input'
          />
        </FormField>
      </div>

      {/* Lanjutkan pattern sama untuk field lain */}
    </div>
  );
}
