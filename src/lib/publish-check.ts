// The desk's pre-publish checklist. The same function renders the list on
// the source page and refuses the publish on the server, so the two cannot
// disagree.

export interface PublishFields {
  heading: string | null;
  rationale: string | null;
  section: 'okuma' | 'izleme' | 'eslik';
  approved_at: Date | null;
  title_original: string | null;
  url: string | null;
  layer: 'once' | 'sonra';
  spoiler_level: 'yok' | 'hafif' | 'var' | 'belirtilmedi';
  rights_status: 'baglanti' | 'ozgun_ozet' | 'lisansli_ceviri' | 'kendi_icerigi';
  rights_note: string | null;
  note: string | null;
}

export interface CheckItem {
  key: 'baslik' | 'baglanti' | 'haklar' | 'not' | 'gerekce' | 'spoiler' | 'katman' | 'onay';
  label: string;
  ok: boolean;
  fix: string;
}

function isWebUrl(value: string | null): boolean {
  if (!value) return false;
  try {
    const u = new URL(value);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}

export function publishChecklist(r: PublishFields): CheckItem[] {
  return [
    {
      key: 'baslik',
      label: 'başlık',
      ok: !!(r.heading?.trim() || r.title_original?.trim()),
      fix: 'türkçe başlık ya da kaynağın özgün başlığı gerekli.',
    },
    {
      key: 'baglanti',
      label: 'tek, açık bir özgün bağlantı',
      ok: r.rights_status === 'kendi_icerigi' || isWebUrl(r.url),
      fix: 'https:// ile başlayan özgün bağlantıyı ekle.',
    },
    {
      key: 'haklar',
      label: 'hak durumu',
      ok: r.rights_status !== 'lisansli_ceviri' || !!r.rights_note?.trim(),
      fix: 'lisanslı çeviri için izin/lisans kaynağını hak notuna yaz.',
    },
    {
      key: 'not',
      label: 'türkçe özgün not',
      ok: r.rights_status !== 'ozgun_ozet' || !!r.note?.trim(),
      fix: '“özgün türkçe özet” seçiliyse kendi notunu yaz; yoksa hak durumunu “yalnızca bağlantı” yap.',
    },
    {
      key: 'gerekce',
      label: '“neden bu kaynak” (önce katmanının temel kaynakları)',
      ok: r.layer !== 'once' || r.section === 'eslik' || !!r.rationale?.trim(),
      fix: '2–3 cümleyle neden seçildiğini yaz ya da masadaki öneriyi gözden geçirip kullan.',
    },
    {
      key: 'spoiler',
      label: 'spoiler düzeyi açıkça seçildi',
      ok: r.spoiler_level !== 'belirtilmedi',
      fix: 'spoiler yok / hafif / içerir seçeneklerinden birini seç.',
    },
    {
      key: 'katman',
      label: 'katman spoiler’a uygun',
      ok: !(r.layer === 'once' && r.spoiler_level === 'var'),
      fix: 'spoiler içeren kaynak “sonra” katmanına taşınmalı.',
    },
    {
      key: 'onay',
      label: 'künye ve bağlantı bir kişi tarafından kontrol edildi',
      ok: !r.url || !!r.approved_at,
      fix: 'özgün sayfayı aç; başlık, yazar, yayın ve tarihi karşılaştır, sonra “künyeyi ve bağlantıyı kontrol ettim” de. otomatik bağlantı denetimi bunun yerine geçmez.',
    },
  ];
}

/** Everything except the human approval: what an edit of a published source must keep true. */
export const contentReady = (r: PublishFields) =>
  publishChecklist(r).every((c) => c.ok || c.key === 'onay');

export const readyToPublish = (r: PublishFields) => publishChecklist(r).every((c) => c.ok);
