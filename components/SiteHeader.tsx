import Link from "next/link";

export const MASINA = {
  home: "https://masinadiamonds.com",
  logo: "https://masinadiamonds.com/cdn/shop/files/Masina_Diamonds_Large_Logo.svg?v=1770244626&width=380",
  appointment: "https://masinadiamonds.com/pages/book-appointment-masina-diamonds-atlanta-ga",
  builder: "https://masinadiamonds.com/pages/custom-ring-builder",
  financing: "https://masinadiamonds.com/pages/financing",
};

interface SiteHeaderProps {
  /** Optional link shown on the left, e.g. back to a collection */
  back?: { href: string; label: string };
  compact?: boolean;
}

export default function SiteHeader({ back, compact }: SiteHeaderProps) {
  return (
    <header>
      {!compact && <div className="announcement">Custom made engagement rings in Atlanta since 1984</div>}
      <div className="site-header">
        <nav className="site-header__side">
          {back ? (
            <Link href={back.href} className="link-underline">
              ← {back.label}
            </Link>
          ) : (
            <a href={MASINA.home} className="link-underline hide-mobile">
              Shop masinadiamonds.com
            </a>
          )}
        </nav>
        <Link href="/" className="site-header__logo" aria-label="Masina Diamonds 3D collection">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={MASINA.logo} alt="Masina Diamonds" width={190} height={44} />
        </Link>
        <nav className="site-header__side site-header__side--end">
          <a href={MASINA.appointment} className="link-underline hide-mobile">
            Book Appointment
          </a>
        </nav>
      </div>
    </header>
  );
}
