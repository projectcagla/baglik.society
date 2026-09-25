'use client';

import { useActionState } from 'react';
import { saveResourceAction, type DeskState } from '@/server/actions/desk';
import type { ResourceRow } from '@/server/dal/films';
import ui from '@/components/ui/ui.module.css';
import { Area, Select, Text } from './Field';
import { FormStatus } from './FormStatus';
import { DraftKeeper } from './DraftKeeper';
import styles from './Desk.module.css';

const initial: DeskState = { ok: false, message: null };

const KINDS = [
  ['article', 'yazı'],
  ['interview', 'söyleşi'],
  ['essay', 'deneme'],
  ['video', 'video'],
  ['podcast', 'podcast'],
  ['music', 'müzik'],
  ['official', 'resmî metin'],
  ['film', 'film'],
  ['book', 'kitap'],
  ['other', 'diğer'],
] as const;

const SECTIONS = [
  ['okuma', 'okuma'],
  ['izleme', 'izle'],
  ['eslik', 'eşlik edenler (bağlam / dinle / izle)'],
] as const;

const SPOILERS = [
  ['yok', 'spoiler yok'],
  ['hafif', 'hafif (konu bilgisi)'],
  ['var', 'spoiler içerir'],
  ['belirtilmedi', 'belirtilmedi'],
] as const;

const RIGHTS = [
  ['ozgun_ozet', 'özgün türkçe özet + bağlantı'],
  ['baglanti', 'yalnızca bağlantı'],
  ['kendi_icerigi', 'kulübün kendi metni'],
  ['lisansli_ceviri', 'lisanslı / izinli çeviri'],
] as const;

/**
 * An editor-only suggestion. It reaches members only if an editor moves it
 * into the field, reads it, and saves — never on its own.
 */
function RationaleSuggestion({ text }: { text: string }) {
  const adopt = () => {
    const field = document.getElementById('f-rationale') as HTMLTextAreaElement | null;
    if (!field) return;
    field.value = text;
    field.dispatchEvent(new Event('input', { bubbles: true }));
    field.focus();
  };
  return (
    <div className={styles.suggestion}>
      <p className={ui.hint}>
        <strong>öneri · onaysız</strong> — kaynağın künyesinden ve senin notundan çıkarıldı; kişisel
        görüşün yerine geçmez. kullanacaksan kendi sözlerinle düzelt.
      </p>
      <p className={styles.suggestionText}>{text}</p>
      <button type="button" className={`${ui.button} ${ui.small}`} onClick={adopt}>
        öneriyi alana taşı
      </button>
    </div>
  );
}

export function ResourceForm({
  filmId,
  layer,
  resource,
}: {
  filmId: string;
  layer: 'once' | 'sonra';
  resource?: ResourceRow;
}) {
  const [state, action, pending] = useActionState(saveResourceAction, initial);
  const r = resource;
  const formId = `resource-${r?.id ?? `new-${filmId}-${layer}`}`;
  return (
    <form id={formId} action={action} className={styles.grid}>
      {r ? (
        <input type="hidden" name="id" value={r.id} />
      ) : (
        <input type="hidden" name="filmId" value={filmId} />
      )}
      <p className={ui.hint}>
        * ile işaretli alanlar yayın öncesi denetimde aranır. taslak her hâliyle kaydedilir; yarım
        bıraktığın form bu cihazda saklanır.
      </p>

      <fieldset className={styles.formPart}>
        <legend>1 · kaynak</legend>
        <div className={styles.cols3}>
          <Select
            name="layer"
            label="katman *"
            options={
              [
                ['once', 'önce'],
                ['sonra', 'sonra (spoiler olabilir)'],
              ] as const
            }
            defaultValue={r?.layer ?? layer}
          />
          <Select
            name="section"
            label="bölüm"
            options={SECTIONS}
            defaultValue={r?.section ?? 'okuma'}
          />
          <Select name="kind" label="tür" options={KINDS} defaultValue={r?.kind ?? 'article'} />
        </div>
        <div className={styles.cols2}>
          <Text
            name="heading"
            label="türkçe başlık *"
            defaultValue={r?.heading}
            hint="editoryal başlık (ör. Gündelik hayatın ayrıntıları); ya da yalnızca özgün başlık"
          />
          <Text
            name="title_original"
            label="özgün başlık"
            defaultValue={r?.title_original}
            hint="kaynağın kendi başlığı, özgün yazımıyla"
          />
        </div>
        <Text
          name="url"
          type="url"
          label="özgün bağlantı *"
          defaultValue={r?.url}
          hint="https:// ile, tek bağlantı. değişirse bağlantı denetimi ve insan onayı sıfırlanır."
        />
      </fieldset>

      <fieldset className={styles.formPart}>
        <legend>2 · künye</legend>
        <div className={styles.cols3}>
          <Text name="author" label="yazar / kişi" defaultValue={r?.author} />
          <Text
            name="publication"
            label="yayın"
            defaultValue={r?.publication}
            hint="BFI, Criterion…"
          />
          <Text
            name="form_label"
            label="biçim etiketi"
            defaultValue={r?.form_label}
            hint="kısa haber, albüm, tiyatro…"
          />
        </div>
        <div className={styles.cols3}>
          <Text name="language" label="dil kodu" defaultValue={r?.language} hint="en, tr, ja…" />
          <Text
            name="published_year"
            label="yayın yılı"
            defaultValue={r?.published_year}
            inputMode="numeric"
          />
          <Text
            name="duration_note"
            label="süre"
            defaultValue={r?.duration_note}
            hint="ör. 47 dk"
          />
        </div>
      </fieldset>

      <fieldset className={styles.formPart}>
        <legend>3 · editoryal</legend>
        <Area
          name="rationale"
          label="neden bu kaynak (2–3 cümle)"
          defaultValue={r?.rationale}
          rows={3}
          hint="* önce katmanının temel kaynaklarında. üyeye bu kaynağı neden seçtiğini söyler; okuma sayfasında notun üstünde durur"
        />
        {r?.rationale_draft && <RationaleSuggestion text={r.rationale_draft} />}
        <Area
          name="note"
          label="türkçe özgün not (1–3 paragraf)"
          defaultValue={r?.note}
          rows={9}
          hint="* özgün özet seçiliyse. kaynağın çevirisi değil, kendi yazdığın not; otomatik üretilmiş metin koyma. boş satır yeni paragraf; *italik*, [metin](https://…)"
        />
        <div className={styles.cols2}>
          <Text name="prompt" label="not (düşünme sorusu)" defaultValue={r?.prompt} />
          <Select
            name="spoiler_level"
            label="spoiler *"
            options={SPOILERS}
            defaultValue={r?.spoiler_level ?? 'yok'}
            hint="spoiler içeren kaynak “önce” katmanında yayımlanamaz"
          />
        </div>
      </fieldset>

      <fieldset className={styles.formPart}>
        <legend>4 · haklar</legend>
        <div className={styles.cols2}>
          <Select
            name="rights_status"
            label="hak durumu *"
            options={RIGHTS}
            defaultValue={r?.rights_status ?? 'ozgun_ozet'}
          />
          <Text
            name="rights_note"
            label="hak notu"
            defaultValue={r?.rights_note}
            hint="izin/lisans kaynağı; çeviri için zorunlu"
          />
        </div>
      </fieldset>

      <details className={styles.formMore}>
        <summary>isteğe bağlı alanlar</summary>
        <div className={styles.grid}>
          <div className={styles.cols3}>
            <Text
              name="link_label"
              label="bağlantı metni"
              defaultValue={r?.link_label}
              hint="orijinal makaleyi aç, albümü dinle…"
            />
            <Text
              name="link_hint"
              label="bağlantı notu"
              defaultValue={r?.link_hint}
              hint="kaynak site üzerinden okunur"
            />
            <Text
              name="access_note"
              label="erişim uyarısı"
              defaultValue={r?.access_note}
              hint="paywall, ülke kısıtı…"
            />
          </div>
          <div className={styles.cols2}>
            <Area
              name="quote"
              label="kısa alıntı"
              defaultValue={r?.quote}
              rows={3}
              hint="yalnızca haklar el veriyorsa, kısa"
            />
            <Text name="quote_credit" label="alıntı künyesi" defaultValue={r?.quote_credit} />
          </div>
          <div className={styles.cols2}>
            <Text
              name="source_minutes"
              label="özgün metnin okuma süresi (dk)"
              defaultValue={r?.source_minutes ?? ''}
              inputMode="numeric"
              hint="yalnızca kendin ölçtüysen; tahmin yazma"
            />
            <Text
              name="position"
              label="sıra"
              defaultValue={r?.position ?? ''}
              inputMode="numeric"
              hint="boşsa sona"
            />
          </div>
          <div className={styles.cols2}>
            <Text
              name="provenance"
              label="köken"
              defaultValue={r?.provenance}
              hint="nereden geldi: pdf adı, editör önerisi…"
            />
            <Text
              name="review_note"
              label="editör notu (üyeler görmez)"
              defaultValue={r?.review_note}
              hint="doğrulanacak ya da karar bekleyen konu; boşaltınca kuyruktan düşer"
            />
          </div>
        </div>
      </details>

      <div className={ui.row}>
        <button type="submit" className={`${ui.button} ${ui.primary}`} disabled={pending}>
          {pending ? 'bekle' : r ? 'kaydet' : 'kaynağı oluştur (taslak)'}
        </button>
        <FormStatus state={state} />
      </div>
      <DraftKeeper formId={formId} saved={state.ok} />
    </form>
  );
}
