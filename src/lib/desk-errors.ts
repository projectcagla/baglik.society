// Editorial rules the database enforces, explained in the desk's words.
export const DESK_ERRORS = {
  'sonra-erken':
    'sonra katmanı ancak gösterimden sonra açılabilir: filmin durumunu “izlendi” yap ya da gecenin başlamasını bekle. başlangıç saati geçti diye kendiliğinden açılmaz; açmak her zaman senin kararın.',
  eksik: 'yayımlanmadı: aşağıdaki yayın öncesi denetimde eksik kalan maddeleri tamamla.',
  'spoiler-once':
    'spoiler içeren bir kaynak “önce” katmanında yayımlanamaz. katmanını “sonra” yap ya da spoiler düzeyini gözden geçir.',
} as const;

export type DeskErrorCode = keyof typeof DESK_ERRORS;

export function deskError(value: unknown): string | null {
  return typeof value === 'string' && value in DESK_ERRORS
    ? DESK_ERRORS[value as DeskErrorCode]
    : null;
}
