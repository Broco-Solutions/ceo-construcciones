import Image from 'next/image';
import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="not-found-screen">
      <Image
        src="/brand/ceo-logo-blanco.png"
        alt="CEO Construcciones"
        priority
        width={414}
        height={307}
      />
      <h1>No encontramos esta página</h1>
      <p>La dirección puede haber cambiado o no estar disponible.</p>
      <Link href="/" className="btn">Volver al inicio</Link>
    </main>
  );
}
