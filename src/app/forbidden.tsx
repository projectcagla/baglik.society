import Link from 'next/link';
import { Quiet } from '@/components/ui/Quiet';

export default function Forbidden() {
  return (
    <Quiet title="bu bölüm sana açık değil.">
      <p>
        <Link href="/oda">odaya dön</Link>
      </p>
    </Quiet>
  );
}
