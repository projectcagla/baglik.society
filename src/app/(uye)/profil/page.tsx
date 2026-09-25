import type { Metadata } from 'next';
import { KeyCreator } from '@/components/member/KeyCreator';
import { ProfileForm } from '@/components/member/ProfileForm';
import ed from '@/components/member/Editorial.module.css';
import ui from '@/components/ui/ui.module.css';
import { formatShort } from '@/lib/dates';
import { endOtherSessionsAction, logoutAction, revokeSessionAction } from '@/server/actions/member';
import { hasPersonalKey } from '@/server/auth/door';
import { listSessions } from '@/server/auth/session';
import { requireMember } from '@/server/auth/viewer';

export const metadata: Metadata = { title: 'profil' };

const ROLE: Record<string, string> = {
  owner: 'kurucu',
  admin: 'yönetici',
  editor: 'editör',
  member: 'üye',
};

export default async function ProfilePage() {
  const viewer = await requireMember();
  const [sessions, keyExists] = await Promise.all([
    listSessions(viewer.id),
    hasPersonalKey(viewer.id),
  ]);

  return (
    <div className={ed.page}>
      <header className={ed.pageHead}>
        <p className={ed.kicker}>{ROLE[viewer.role]}</p>
        <h1 className={ed.h1}>{viewer.displayName}</h1>
      </header>

      <section className={`${ed.section} ${ed.narrow}`} aria-labelledby="bilgiler">
        <h2 id="bilgiler" className={ed.h2}>
          bilgilerin
        </h2>
        <ProfileForm name={viewer.displayName} email={viewer.email} />
      </section>

      <section className={`${ed.section} ${ed.narrow}`} aria-labelledby="anahtar">
        <h2 id="anahtar" className={ed.h2}>
          kişisel anahtar
        </h2>
        <p className={ed.secondary}>
          {keyExists
            ? 'bir anahtarın var. kaybettiysen ya da başkası gördüyse yenisini oluştur; eskisi hemen geçersiz olur.'
            : 'henüz anahtarın yok. oluşturmazsan bu oturum kapandığında yeni bir davet kodu gerekir.'}
        </p>
        <KeyCreator
          hasKey={keyExists}
          account={viewer.email ?? viewer.displayName}
          next="/profil"
        />
      </section>

      <section className={`${ed.section} ${ed.narrow}`} aria-labelledby="oturumlar">
        <h2 id="oturumlar" className={ed.h2}>
          açık oturumlar
        </h2>
        <ul role="list" className={ed.list}>
          {sessions.map((s) => (
            <li key={s.id} className={ed.entry}>
              <p>
                {s.user_agent ?? 'cihaz'}
                {s.id === viewer.sessionId && <span className={ed.badge}> bu cihaz</span>}
              </p>
              <p className={ed.entryMeta}>
                <span>açıldı {formatShort(s.created_at)}</span>
                <span>son kullanım {formatShort(s.last_used_at)}</span>
              </p>
              {s.id !== viewer.sessionId && (
                <form action={revokeSessionAction}>
                  <input type="hidden" name="sessionId" value={s.id} />
                  <button type="submit" className={ed.linkButton}>
                    bu oturumu kapat
                  </button>
                </form>
              )}
            </li>
          ))}
        </ul>
        <div className={ui.row}>
          {sessions.length > 1 && (
            <form action={endOtherSessionsAction}>
              <button type="submit" className={`${ui.button} ${ui.small}`}>
                diğer oturumları kapat
              </button>
            </form>
          )}
          <form action={logoutAction}>
            <button type="submit" className={`${ui.button} ${ui.small}`}>
              çıkış
            </button>
          </form>
        </div>
      </section>

      <section className={`${ed.section} ${ed.narrow}`} aria-labelledby="gizlilik">
        <h2 id="gizlilik" className={ed.h2}>
          verilerin
        </h2>
        <div className={ed.prose}>
          <p>
            burada yalnızca adın, isteğe bağlı e-posta adresin, davet ve katılım bilgin, kendi
            notların ve okuma işaretlerin tutulur. ip adresin saklanmaz; kötüye kullanımı sınırlamak
            için kısa süreli, geri çevrilemez bir özet tutulur ve iki gün içinde silinir.
          </p>
          <p>
            katılım bilgin ve özel notların diğer üyelere gösterilmez. yöneticiler katılımını görür,
            özel notlarını göremez. veriler barındırma ve veritabanı sağlayıcısının sunucularında
            şifreli bağlantıyla saklanır; uçtan uca şifreleme vaat edilmez.
          </p>
          <p>
            tüm kayıtlarını indirebilir, silinmelerini yöneticiden isteyebilirsin. hukuki metinlerin
            kulüp yöneticisi tarafından ayrıca gözden geçirilmesi gerekir.
          </p>
        </div>
        <p>
          <a className={ui.button} href="/profil/veri" download>
            kayıtlarımı indir (json)
          </a>
        </p>
      </section>
    </div>
  );
}
