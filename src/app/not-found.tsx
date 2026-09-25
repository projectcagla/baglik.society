import Link from 'next/link';
import { Quiet } from '@/components/ui/Quiet';

export default function NotFound() {
  return (
    <Quiet title="burada bir şey yok.">
      <p>
        <Link href="/">kapıya dön</Link>
      </p>
    </Quiet>
  );
}
