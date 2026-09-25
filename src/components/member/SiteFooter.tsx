import { logoutAction } from '@/server/actions/member';
import styles from './Shell.module.css';

export function SiteFooter() {
  return (
    <footer className={`${styles.footer} no-print`}>
      <span className="meta">bağlık.society</span>
      <form action={logoutAction}>
        <button type="submit" className={styles.logout}>
          çıkış
        </button>
      </form>
    </footer>
  );
}
