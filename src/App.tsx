import { useCallback, useEffect, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { supabase } from "./supabase";

const AUTH_LOAD_TIMEOUT_MS = 12000;

function withTimeout<T>(operation: PromiseLike<T>, message: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), AUTH_LOAD_TIMEOUT_MS);
  });

  return Promise.race([Promise.resolve(operation), timeout]).finally(() => clearTimeout(timeoutId));
}

type Page =
  | "home" | "explore" | "service" | "vendor" | "packages" | "cart"
  | "checkout" | "confirmation" | "bookings" | "profile" | "login" | "signup"
  | "vendor-login" | "vendor-register" | "vendor-pending"
  | "vendor-dashboard" | "vendor-bookings" | "vendor-services" | "vendor-portfolio" | "vendor-profile"
  | "admin-login" | "admin-dashboard" | "admin-vendors" | "admin-users" | "admin-bookings" | "admin-services";

type CustomerProfile = {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  role?: string;
  created_at?: string;
};

type ServiceItem = {
  id?: string;
  vendorId?: string | null;
  name: string;
  description?: string | null;
  vendor: string;
  city: string;
  rating?: string;
  price: string;
  priceAmount?: number;
  type: string;
  image?: string | null;
  category: string;
  eventType: string;
  eventTypes?: string[];
};

type CartItem = {
  service_id: string;
  vendor_id: string;
  name: string;
  price: number;
  image: string | null;
  quantity: number;
  event_type: string;
  vendor_name: string;
  city: string;
  category: string;
};

type BookingRecord = {
  id: string;
  customer_id: string;
  event_type: string;
  event_date: string;
  venue: string;
  phone: string;
  total_amount: number | string;
  status: string;
  payment_status: string;
  created_at: string;
};

type BookingItemInsert = {
  booking_id: string;
  service_id: string;
  vendor_id: string;
  quantity: number;
  price: number;
};

type VendorRecord = {
  id: string;
  auth_user_id: string;
  business_name: string;
  city: string;
  status: string;
};

type VendorBooking = {
  booking: BookingRecord;
  customer: CustomerProfile | null;
  items: {
    id: string;
    service_id: string;
    service_name: string;
    quantity: number;
    price: number | string;
  }[];
};

type VendorService = {
  id: string;
  vendor_id: string;
  name: string;
  description: string | null;
  category: string | null;
  price: number | string;
  image: string | null;
  event_types: string[] | string | null;
  status: string;
};

type PackageItem = {
  name: string;
  text: string;
  price: string;
  old: string;
  save: string;
  image: string;
  eventType: string;
};

const photos = {
  hero: "https://images.unsplash.com/photo-1587271407850-8d438ca9fdf2?auto=format&fit=crop&w=1600&q=85",
  birthday: "https://images.unsplash.com/photo-1643175816971-a463dee6ae61?auto=format&fit=crop&w=900&q=80",
  family: "https://images.unsplash.com/photo-1728024450639-dc1b6183dbf2?auto=format&fit=crop&w=900&q=80",
  wedding: "https://images.unsplash.com/photo-1708606811579-23b18fc48007?auto=format&fit=crop&w=1000&q=80",
  weddingWide: "https://images.unsplash.com/photo-1469371670807-013ccf25f16a?auto=format&fit=crop&w=1400&q=80",
  proposal: "https://images.unsplash.com/photo-1550155891-1ab2d265d9c3?auto=format&fit=crop&w=900&q=80",
  dinner: "https://images.unsplash.com/photo-1557918630-5753f944dc6c?auto=format&fit=crop&w=900&q=80",
  catering: "https://images.unsplash.com/photo-1555244162-803834f70033?auto=format&fit=crop&w=900&q=80",
  event: "https://images.unsplash.com/photo-1772127822525-7eda37383b9f?auto=format&fit=crop&w=1000&q=80",
};

const eventOptions = [
  "Birthday",
  "Kitty Party",
  "Society Event",
  "Anniversary",
  "Corporate Event",
  "Couple Planning",
  "Proposal",
];

type ServiceEventFilter = {
  values: string[];
};

type ServiceVendorRelation = {
  id: string;
  business_name: string;
  city: string | null;
  status: string;
};

type SupabaseServiceRow = {
  id: string;
  vendor_id: string | null;
  name: string;
  description: string | null;
  category: string | null;
  price: number | string;
  image: string | null;
  event_types: string[] | string | null;
  status: string;
  vendors: ServiceVendorRelation | ServiceVendorRelation[] | null;
};

function normalizeEventTypes(value: SupabaseServiceRow["event_types"]): string[] {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  return value.split(/[;,|]/).map((eventType) => eventType.trim()).filter(Boolean);
}

function mapSupabaseService(row: SupabaseServiceRow): ServiceItem | null {
  const vendor = Array.isArray(row.vendors) ? row.vendors[0] : row.vendors;
  if (!vendor || !["approved", "active"].includes(vendor.status.toLowerCase())) {
    return null;
  }

  const eventTypes = normalizeEventTypes(row.event_types);
  const priceValue = Number(row.price);
  return {
    id: row.id,
    vendorId: row.vendor_id,
    name: row.name,
    description: row.description,
    vendor: vendor.business_name,
    city: vendor.city ?? "",
    price: Number.isFinite(priceValue)
      ? `₹${priceValue.toLocaleString("en-IN")}`
      : String(row.price),
    priceAmount: priceValue,
    type: "fixed",
    image: row.image,
    category: row.category ?? eventTypes[0] ?? "Event service",
    eventType: eventTypes[0] ?? row.category ?? "Event",
    eventTypes,
  };
}

function eventFilterFor(label: string): ServiceEventFilter {
  if (label === "Corporate Event") {
    return { values: ["Corporate Event", "Corporate"] };
  }
  if (label === "Couple Planning") {
    return { values: ["Couple Planning", "Couple Planning/Proposals", "Proposal", "Proposals"] };
  }
  if (label === "Proposal") {
    return { values: ["Proposal", "Proposals", "Couple Planning", "Couple Planning/Proposals"] };
  }
  return { values: [label] };
}

async function fetchActiveServices(
  eventType?: string,
  serviceId?: string,
  category?: string,
  serviceIds?: string[],
  city?: string,
): Promise<ServiceItem[]> {
  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  let request = supabase
    .from("services")
    .select("id, vendor_id, name, description, category, price, image, event_types, status, vendors!inner(id, business_name, city, status)")
    .eq("status", "active")
    .in("vendors.status", ["approved", "active"]);

  if (eventType) {
    const eventValues = eventFilterFor(eventType).values;
    request = request.or(
      `event_types.ov.{${eventValues.join(",")}},event_types.eq.{}`,
    );
  }
  if (serviceId) {
    request = request.eq("id", serviceId);
  }
  if (serviceIds) {
    request = request.in("id", serviceIds);
  }
  if (city) {
    request = request.ilike("vendors.city", city);
  }
  if (category && category !== "All categories") {
    request = request.eq("category", category);
  }

  const { data, error } = await request;
  if (error) {
    console.error("Supabase service query failed", error);
    throw error;
  }

  return (data ?? [])
    .map(mapSupabaseService)
    .filter((service): service is ServiceItem => service !== null);
}

function readCartFromStorage(): CartItem[] {
  try {
    const savedCart = localStorage.getItem("jashn-cart");
    if (!savedCart) return [];
    const parsed: unknown = JSON.parse(savedCart);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is CartItem =>
      typeof item === "object" &&
      item !== null &&
      "service_id" in item &&
      typeof item.service_id === "string" &&
      "vendor_id" in item &&
      typeof item.vendor_id === "string" &&
      "name" in item &&
      typeof item.name === "string" &&
      "price" in item &&
      typeof item.price === "number" &&
      "quantity" in item &&
      typeof item.quantity === "number" &&
      Number.isInteger(item.quantity) &&
      "event_type" in item &&
      typeof item.event_type === "string" &&
      "category" in item &&
      typeof item.category === "string" &&
      "vendor_name" in item &&
      typeof item.vendor_name === "string" &&
      "city" in item &&
      typeof item.city === "string" &&
      item.quantity > 0,
    );
  } catch (error) {
    console.error("Unable to restore the saved cart", error);
    return [];
  }
}

function formatEventLabel(label: string): string {
  return eventOptions.includes(label) ? label : "Birthday";
}

const categoryOptions = ["Decoration", "Catering", "Photography", "Entertainment"];

function formatCategoryLabel(label: string | null): string {
  return label && categoryOptions.includes(label) ? label : "All categories";
}

function readPageFromLocation(): Page {
  const page = new URLSearchParams(window.location.search).get("page");
  const knownPages: Page[] = [
    "home", "explore", "service", "vendor", "packages", "cart", "checkout",
    "confirmation", "bookings", "profile", "login", "signup", "vendor-login",
    "vendor-register", "vendor-pending", "vendor-dashboard", "vendor-bookings",
    "vendor-services", "vendor-portfolio", "vendor-profile", "admin-login",
    "admin-dashboard", "admin-vendors", "admin-users", "admin-bookings", "admin-services",
  ];
  return knownPages.includes(page as Page) ? page as Page : "home";
}

function updateLocation(page: Page, params: Record<string, string | null> = {}) {
  const search = new URLSearchParams();
  search.set("page", page);
  Object.entries(params).forEach(([key, value]) => {
    if (value) search.set(key, value);
  });
  window.history.pushState({}, "", `${window.location.pathname}?${search.toString()}`);
}

const services: ServiceItem[] = [
  { name: "Premium Birthday Decoration", vendor: "Rangoli Decor Studio", city: "Pune", rating: "4.8", price: "₹7,500", type: "fixed", image: photos.birthday, category: "Decoration", eventType: "Birthday" },
  { name: "Intimate Wedding Photography", vendor: "The Shaadi Lens", city: "Mumbai", rating: "4.9", price: "₹24,000", type: "per event", image: photos.weddingWide, category: "Photography", eventType: "Couple Planning/Proposals" },
  { name: "Celebration Buffet for 50", vendor: "Swaad Caterers", city: "Pune", rating: "4.7", price: "₹650", type: "per plate", image: photos.catering, category: "Catering", eventType: "Society Event" },
  { name: "Live DJ & Sound Setup", vendor: "Beat Bazaar", city: "Mumbai", rating: "4.6", price: "₹12,000", type: "fixed", image: photos.event, category: "DJ & Entertainment", eventType: "Corporate Event" },
  { name: "Romantic Rooftop Setup", vendor: "Moments by Mira", city: "Bengaluru", rating: "4.9", price: "₹9,999", type: "fixed", image: photos.proposal, category: "Planning", eventType: "Couple Planning/Proposals" },
  { name: "Floral Anniversary Dinner", vendor: "Rangoli Decor Studio", city: "Pune", rating: "4.8", price: "₹8,500", type: "fixed", image: photos.dinner, category: "Decoration", eventType: "Anniversary" },
];

const packages: PackageItem[] = [
  { name: "Birthday Celebration", text: "Decoration, cake, snacks and music for a cheerful house party.", price: "₹14,999", old: "₹18,500", save: "Save ₹3,501", image: photos.birthday, eventType: "Birthday" },
  { name: "Romantic Proposal", text: "A private setup with flowers, lights, dinner and a photographer.", price: "₹12,499", old: "₹15,000", save: "Save ₹2,501", image: photos.proposal, eventType: "Couple Planning/Proposals" },
  { name: "Corporate Evening", text: "Venue styling, buffet, sound and event coordination.", price: "₹39,999", old: "₹46,000", save: "Save ₹6,001", image: photos.event, eventType: "Corporate Event" },
  { name: "Anniversary Celebration", text: "Elegant decor, cake, dinner and a keepsake photo session.", price: "₹16,999", old: "₹20,500", save: "Save ₹3,501", image: photos.dinner, eventType: "Anniversary" },
];

const icons: Record<string, ReactNode> = {
  pin: <><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></>,
  star: <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-2.9-5.6 2.9 1.1-6.2L3 9.6l6.2-.9L12 3Z"/>,
  search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,
  menu: <path d="M4 7h16M4 12h16M4 17h16"/>,
  close: <path d="m6 6 12 12M18 6 6 18"/>,
  check: <path d="m5 12 4 4L19 6"/>,
  arrow: <path d="m9 18 6-6-6-6"/>,
  user: <><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></>,
  bag: <><path d="M5 8h14l1 13H4L5 8Z"/><path d="M9 9V6a3 3 0 0 1 6 0v3"/></>,
};

function Icon({ name, size = 20 }: { name: string; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{icons[name]}</svg>;
}

function Button({ children, onClick, variant = "primary", type = "button", full = false, disabled = false }: { children: ReactNode; onClick?: () => void; variant?: "primary" | "secondary" | "text" | "danger"; type?: "button" | "submit"; full?: boolean; disabled?: boolean }) {
  return <button type={type} onClick={onClick} className={`btn btn-${variant}${full ? " btn-full" : ""}`} disabled={disabled}>{children}</button>;
}

function Heading({ children, level = 2, className = "" }: { children: ReactNode; level?: 1 | 2 | 3 | 4; className?: string }) {
  const Tag = `h${level}` as "h1" | "h2" | "h3" | "h4";
  return <Tag className={className}>{children}</Tag>;
}

function Field({
  label,
  placeholder,
  type = "text",
  defaultValue,
  value,
  onChange,
  name,
  required = false,
}: {
  label: string;
  placeholder?: string;
  type?: string;
  defaultValue?: string;
  value?: string;
  onChange?: (event: ChangeEvent<HTMLInputElement>) => void;
  name?: string;
  required?: boolean;
}) {
  return <label className="field"><span>{label}</span><input type={type} placeholder={placeholder} defaultValue={defaultValue} value={value} onChange={onChange} name={name} required={required} /></label>;
}

function SelectField({
  label,
  children,
  compact = false,
  value,
  onChange,
  name,
}: {
  label: string;
  children: ReactNode;
  compact?: boolean;
  value?: string;
  onChange?: (event: ChangeEvent<HTMLSelectElement>) => void;
  name?: string;
}) {
  return <label className={`field${compact ? " field-compact" : ""}`}><span>{label}</span><select value={value} onChange={onChange} name={name}>{children}</select></label>;
}

function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "success" | "warning" | "danger" | "wine" }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

function Logo({ go }: { go: (page: Page) => void }) {
  return <button className="logo" onClick={() => go("home")} aria-label="Jashn home"><span>J</span>Jashn<small>Plan. Book. Celebrate.</small></button>;
}

function Header({ go, page, customerName, role, onLogout, cartCount }: { go: (page: Page) => void; page: Page; customerName?: string | null; role?: string | null; onLogout?: () => void; cartCount: number }) {
  const [open, setOpen] = useState(false);
  const navigate = (target: Page) => { go(target); setOpen(false); };
  const workspacePage: Page = role === "admin" ? "admin-dashboard" : role === "vendor" ? "vendor-dashboard" : "profile";
  const accountLabel = customerName ? `${role === "admin" ? "Admin" : role === "vendor" ? "Vendor" : "Hi"}, ${customerName}` : "Log in";
  return <header className="site-header">
    <div className="nav-shell">
      <Logo go={go} />
      <nav className={`main-nav${open ? " open" : ""}`}>
        <button className={page === "explore" ? "active" : ""} onClick={() => navigate("explore")}>Explore</button>
        <button className={page === "packages" ? "active" : ""} onClick={() => navigate("packages")}>Packages</button>
        <button onClick={() => navigate("explore")}>Services</button>
        <button onClick={() => navigate("vendor-register")}>Become a Vendor</button>
        <div className="mobile-auth">
          <Button variant="secondary" full onClick={() => customerName ? navigate(workspacePage) : navigate("login")}>{accountLabel}</Button>
          {!customerName && <Button full onClick={() => navigate("signup")}>Get Started</Button>}
          {customerName && onLogout && <Button full variant="secondary" onClick={onLogout}>Log out</Button>}
        </div>
      </nav>
      <div className="nav-actions">
        {role !== "admin" && <button className="cart-button" onClick={() => go("cart")} aria-label="Cart"><Icon name="bag" /><span>{cartCount}</span></button>}
        <Button variant="text" onClick={() => customerName ? go(workspacePage) : go("login")}>{accountLabel}</Button>
        {customerName ? <Button onClick={onLogout ?? (() => go("home"))}>Log out</Button> : <Button onClick={() => go("signup")}>Get Started</Button>}
      </div>
      <button className="menu-button" onClick={() => setOpen(!open)} aria-label="Toggle menu"><Icon name={open ? "close" : "menu"} /></button>
    </div>
  </header>;
}

function Footer({ go }: { go: (page: Page) => void }) {
  return <footer>
    <div className="footer-main shell">
      <div><Logo go={go} /><p>Simple event planning, with trusted local people.</p></div>
      <div><strong>Plan</strong><button onClick={() => go("explore")}>Explore services</button><button onClick={() => go("packages")}>Ready-made packages</button><button onClick={() => go("bookings")}>My bookings</button><button onClick={() => go("profile")}>My profile</button></div>
      <div><strong>Partners</strong><button onClick={() => go("vendor-login")}>Vendor login</button><button onClick={() => go("admin-login")}>Admin portal</button><button>Help centre</button></div>
      <div><strong>Contact</strong><p>hello@jashn.in</p><p>+91 20 4567 8900</p><p>Pune, Maharashtra</p></div>
    </div>
    <div className="footer-bottom shell">© 2025 Jashn Events. Made for celebrations across India.</div>
    
<div className="border-t border-gray-200 mt-8 pt-5 pb-4 text-center">
  <p className="text-sm text-gray-500">
    © 2026 Jashn. All rights reserved.
  </p>
  <p className="mt-2 text-sm text-gray-500">
    Crafted with care by{" "}
    <span className="font-semibold text-[#941D49]">
      Parth Kachare
    </span>
    <span className="ml-1 text-[#941D49]">✦</span>
  </p>
</div>

  </footer>;
}

function Rating({ value }: { value: string }) {
  return <span className="rating"><Icon name="star" size={15} /> {value}</span>;
}

function ServiceCard({
  item,
  go,
  onSelectService,
  onOpenService,
}: {
  item: ServiceItem;
  go: (page: Page) => void;
  onSelectService?: (service: ServiceItem) => void;
  onOpenService?: (serviceId: string) => void;
}) {
  const handleOpen = () => {
    onSelectService?.(item);
    if (item.id && onOpenService) {
      onOpenService(item.id);
    } else {
      go("service");
    }
  };
  return <article className="service-card">
    <button className="card-image" onClick={handleOpen}>{item.image && <img src={item.image} alt={item.name} />}<Badge tone="wine">{item.category}</Badge></button>
    <div className="card-body">
      <div className="card-title-row"><Heading level={3}>{item.name}</Heading>{item.rating && <Rating value={item.rating} />}</div>
      <p className="vendor-name">{item.vendor}</p>
      <p className="meta"><Icon name="pin" size={16} />{item.city}</p>
      <div className="price-row"><div><strong>{item.price}</strong><span>{item.type}</span></div><Button variant="secondary" onClick={handleOpen}>View Details</Button></div>
    </div>
  </article>;
}

function PackageCard({ item, go, onSelectService }: { item: PackageItem; go: (page: Page) => void; onSelectService?: (service: ServiceItem) => void }) {
  return <article className="package-card">
    <img src={item.image} alt={item.name} />
    <div>
      <Heading level={3}>{item.name}</Heading>
      <p>{item.text}</p>
      <div className="package-price"><span>{item.old}</span><strong>{item.price}</strong><Badge tone="success">{item.save}</Badge></div>
      <Button variant="secondary" onClick={() => {
        const matchingService = services.find((service) => service.eventType === item.eventType) ?? services[0];
        onSelectService?.(matchingService);
        go("service");
      }}>View Package</Button>
    </div>
  </article>;
}

function SearchBox({ go }: { go: (page: Page) => void }) {
  return <div className="search-box">
    <SelectField label="Location"><option>Pune</option><option>Mumbai</option><option>Bengaluru</option><option>Delhi NCR</option></SelectField>
    <SelectField label="Event type"><option>Birthday</option><option>Wedding</option><option>Anniversary</option><option>Corporate</option><option>Proposal</option></SelectField>
    <Field label="Event date" type="date" />
    <Button onClick={() => go("explore")}><Icon name="search" size={18} /> Find Services</Button>
  </div>;
}

function Home({ go, onSelectService }: { go: (page: Page) => void; onSelectService?: (service: ServiceItem) => void }) {
  const celebrations = [
    ["Birthday", "Cake, decor & more"], ["Wedding", "For your big day"], ["Anniversary", "Celebrate together"],
    ["Corporate", "Team events"], ["Party", "Good times, sorted"], ["Proposal", "Make it memorable"],
  ];
  return <>
    <section className="hero">
      <div className="hero-image"><img src={photos.hero} alt="Indian wedding ceremony under a floral canopy" /></div>
      <div className="hero-content shell">
        <div className="hero-copy"><Badge tone="wine">Celebrations, made simpler</Badge><Heading level={1}>Plan the whole celebration <em>in one place.</em></Heading><p>Find trusted vendors, choose the services you need, and make your event memorable without the planning headache.</p></div>
        <SearchBox go={go} />
      </div>
    </section>
    <section className="section shell">
      <div className="section-head"><div><span className="eyebrow">Start with the occasion</span><Heading>What are you celebrating?</Heading></div><Button variant="text" onClick={() => go("explore")}>View all <Icon name="arrow" size={17} /></Button></div>
      <div className="celebration-grid">{celebrations.map(([name, desc], i) => <button key={name} className="celebration-card" onClick={() => go("explore")}><span>{["01","02","03","04","05","06"][i]}</span><div><strong>{name}</strong><small>{desc}</small></div><Icon name="arrow" size={18} /></button>)}</div>
    </section>
    <section className="section section-tint"><div className="shell">
      <div className="section-head"><div><span className="eyebrow">Less planning, more celebrating</span><Heading>Popular packages</Heading><p>Thoughtful bundles for occasions people book most.</p></div><Button variant="text" onClick={() => go("packages")}>See all packages <Icon name="arrow" size={17} /></Button></div>
      <div className="package-grid">{packages.slice(0, 4).map(item => <PackageCard key={item.name} item={item} go={go} onSelectService={onSelectService} />)}</div>
    </div></section>
    <section className="section shell">
      <div className="section-head"><div><span className="eyebrow">Around Pune</span><Heading>Popular services near you</Heading></div><Button variant="text" onClick={() => go("explore")}>Browse services <Icon name="arrow" size={17} /></Button></div>
      <div className="service-grid">{services.slice(0, 3).map(item => <ServiceCard key={item.name} item={item} go={go} onSelectService={onSelectService} />)}</div>
    </section>
    <section className="why section-tint"><div className="shell why-grid">
      <div><span className="eyebrow">Why Jashn?</span><Heading>Good celebrations need reliable people.</Heading><p>We keep planning straightforward, from the first search to the final confirmation.</p></div>
      <div className="why-points">{["Trusted local vendors|Profiles, reviews and pricing you can check before booking.","Easy booking|Clear inclusions and no long back-and-forth.","Ready-made packages|Useful combinations that save time and money.","Everything in one place|Decor, food, photos, music and planning."].map((item, i) => { const [a,b] = item.split("|"); return <div key={a}><span>{i + 1}</span><p><strong>{a}</strong>{b}</p></div>; })}</div>
    </div></section>
    <section className="cta shell"><div><Heading>Ready to plan your event?</Heading><p>Start with your city and occasion. We’ll show you the right people.</p></div><Button onClick={() => go("explore")}>Explore Services</Button></section>
  </>;
}

function PageHero({ eyebrow, title, text }: { eyebrow?: string; title: string; text?: string }) {
  return <div className="page-hero shell">{eyebrow && <span className="eyebrow">{eyebrow}</span>}<Heading level={1}>{title}</Heading>{text && <p>{text}</p>}</div>;
}

function Explore({
  go,
  selectedEvent,
  selectedCategory,
  onEventChange,
  onCategoryChange,
  onSelectService,
  onOpenService,
}: {
  go: (page: Page) => void;
  selectedEvent: string;
  selectedCategory: string;
  onEventChange: (eventType: string) => void;
  onCategoryChange: (category: string) => void;
  onSelectService?: (service: ServiceItem) => void;
  onOpenService: (serviceId: string) => void;
}) {
  const [results, setResults] = useState<ServiceItem[]>([]);
  const [location, setLocation] = useState("Pune");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    fetchActiveServices(selectedEvent, undefined, selectedCategory, undefined, location)
      .then((servicesForEvent) => {
        if (active) setResults(servicesForEvent);
      })
      .catch(() => {
        if (active) {
          setResults([]);
          setError("Unable to load services right now. Please try again.");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [selectedEvent, selectedCategory, location]);

  return <>
    <PageHero eyebrow={`Services in ${location}`} title="Find everything you need for your event" text="Compare trusted local vendors, clear prices and genuine reviews." />
    <main className="shell market-layout">
      <aside className="filters"><div className="filter-head"><Heading level={3}>Filters</Heading><button onClick={() => { onEventChange("Birthday"); onCategoryChange("All categories"); }}>Clear all</button></div>
        <SelectField label="Location" value={location} onChange={(event) => setLocation(event.target.value)}><option>Pune</option><option>Mumbai</option><option>Bengaluru</option></SelectField>
        <SelectField label="Event type" value={selectedEvent} onChange={(event) => onEventChange(event.target.value)}>
          {eventOptions.map((eventType) => <option key={eventType}>{eventType}</option>)}
        </SelectField>
        <SelectField label="Category" value={selectedCategory} onChange={(event) => onCategoryChange(event.target.value)}>
          <option>All categories</option>
          {categoryOptions.map((category) => <option key={category}>{category}</option>)}
        </SelectField>
        <SelectField label="Price"><option>Any price</option><option>Under ₹10,000</option><option>₹10,000–₹25,000</option><option>₹25,000+</option></SelectField>
        <SelectField label="Rating"><option>Any rating</option><option>4.5 and above</option><option>4.0 and above</option></SelectField>
      </aside>
      <div className="results"><div className="results-top"><div><strong>{loading ? "Loading..." : `${results.length} services`}</strong><span> available in {location}</span></div><SelectField label="Sort by" compact><option>Recommended</option><option>Price: low to high</option><option>Top rated</option></SelectField></div>
        {loading ? <div className="empty-state"><Heading level={2}>Loading services…</Heading></div>
          : error ? <div className="empty-state"><Heading level={2}>Services unavailable</Heading><p>{error}</p></div>
          : results.length === 0 ? <div className="empty-state"><Heading level={2}>No services available for this event yet.</Heading></div>
          : <div className="service-grid two-col">{results.map((item) => <ServiceCard key={item.id} item={item} go={go} onSelectService={onSelectService} onOpenService={onOpenService} />)}</div>}
      </div>
    </main>
  </>;
}

function ServiceDetails({
  go,
  serviceId,
  onLoadService,
  onBookNow,
  onAddToCart,
}: {
  go: (page: Page) => void;
  serviceId: string | null;
  onLoadService: (service: ServiceItem) => void;
  onBookNow?: (service: ServiceItem) => void;
  onAddToCart?: (service: ServiceItem) => void;
}) {
  const [selectedItem, setSelectedItem] = useState<ServiceItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setSelectedItem(null);
    setError(null);
    if (!serviceId) {
      setLoading(false);
      setError("No service was selected.");
      return () => {
        active = false;
      };
    }

    setLoading(true);
    fetchActiveServices(undefined, serviceId)
      .then((matchingServices) => {
        if (!active) return;
        const service = matchingServices[0] ?? null;
        setSelectedItem(service);
        if (service) onLoadService(service);
      })
      .catch(() => {
        if (active) setError("Unable to load this service right now. Please try again.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [serviceId, onLoadService]);

  if (loading) {
    return <main className="shell detail-page"><div className="empty-state"><Heading level={2}>Loading service…</Heading></div></main>;
  }
  if (!selectedItem) {
    return <main className="shell detail-page"><div className="empty-state"><Heading level={2}>{error ?? "Service not found."}</Heading><Button onClick={() => go("explore")}>Explore Events</Button></div></main>;
  }

  return <main className="shell detail-page">
    <div className="breadcrumbs"><button onClick={() => go("explore")}>Explore</button><Icon name="arrow" size={14} /><span>{selectedItem.name}</span></div>
    <div className="gallery" style={{ gridTemplateColumns: "1fr", gridTemplateRows: "minmax(280px, 510px)" }}>
      {selectedItem.image
        ? <img className="gallery-main" style={{ gridRow: "auto" }} src={selectedItem.image} alt={selectedItem.name} />
        : <div className="gallery-placeholder">No service image available</div>}
    </div>
    <div className="detail-layout">
      <div className="detail-content">
        <Badge tone="wine">{selectedItem.eventType}</Badge><Heading level={1}>{selectedItem.name}</Heading>
        <div className="detail-meta"><span><strong>{selectedItem.vendor}</strong></span><span><Icon name="pin" size={17} /> {selectedItem.city}</span></div>
        <div className="content-section"><Heading level={2}>About this service</Heading><p>{selectedItem.description || "No description is available for this service yet."}</p></div>
        <div className="content-section"><Heading level={2}>Event type and category</Heading><div className="tag-list">{(selectedItem.eventTypes?.length ? selectedItem.eventTypes : [selectedItem.eventType]).map((eventType) => <Badge key={eventType}>{eventType}</Badge>)}<Badge>{selectedItem.category}</Badge></div></div>
      </div>
      <aside className="booking-card"><div className="booking-price"><strong>{selectedItem.price}</strong><span>{selectedItem.type}</span></div><div className="total-line"><span>Total</span><strong>{selectedItem.price}</strong></div><Button full onClick={() => { if (onBookNow) onBookNow(selectedItem); else go("checkout"); }}>Book Now</Button><Button full variant="secondary" onClick={() => { if (onAddToCart) onAddToCart(selectedItem); }}>Add to Cart</Button><small>No payment needed right now.</small></aside>
    </div>
  </main>;
}

function VendorProfile({ go }: { go: (page: Page) => void }) {
  const [tab, setTab] = useState("Services");
  return <main>
    <div className="vendor-cover"><img src={photos.wedding} alt="Decorated Indian event stage" /></div>
    <div className="shell vendor-intro"><img className="vendor-avatar" src={photos.birthday} alt="Rangoli Decor Studio work" /><div><div className="verified-line"><Heading level={1}>Rangoli Decor Studio</Heading><Badge tone="success">Verified</Badge></div><div className="detail-meta"><Rating value="4.8 · 86 reviews" /><span><Icon name="pin" size={17} /> Pune, Maharashtra</span></div><p>Family-run event decorators creating warm, colourful celebrations across Pune since 2018.</p></div><div className="vendor-actions"><Button onClick={() => go("service")}>Book Service</Button><Button variant="secondary">Contact</Button></div></div>
    <div className="shell tabs">{["Services","Portfolio","Reviews"].map(x => <button key={x} className={tab === x ? "active" : ""} onClick={() => setTab(x)}>{x}</button>)}</div>
    <section className="shell vendor-tab">
      {tab === "Services" && <div className="service-grid">{services.filter(x => x.vendor === "Rangoli Decor Studio").map(item => <ServiceCard key={item.name} item={item} go={go} />)}</div>}
      {tab === "Portfolio" && <div className="portfolio-grid">{[photos.birthday, photos.wedding, photos.dinner, photos.proposal, photos.family, photos.weddingWide].map((x,i) => <img key={i} src={x} alt="Recent Rangoli Decor Studio event" />)}</div>}
      {tab === "Reviews" && <div className="review-list">{["Priya Mehta|12 August 2025|The setup looked just like we discussed. Friendly team and everything was ready well before guests arrived.","Ankit Rao|26 July 2025|Booked them for my parents’ anniversary. Simple, elegant and no last-minute surprises.","Shreya Nair|8 June 2025|Clear pricing and very responsive over the phone. Would book again."].map(r => {const [a,b,c]=r.split("|"); return <blockquote key={a}><Rating value="5.0" /><p>“{c}”</p><footer><strong>{a}</strong> · {b}</footer></blockquote>})}</div>}
    </section>
  </main>;
}

function Packages({ go, onSelectService }: { go: (page: Page) => void; onSelectService?: (service: ServiceItem) => void }) {
  return <><PageHero eyebrow="Save time and plan with confidence" title="Ready-made packages" text="Everything you need, bundled together. Choose a package as-is or adjust it for your event." /><main className="section shell"><div className="package-grid package-page">{packages.map(item => <PackageCard key={item.name} item={item} go={go} onSelectService={onSelectService} />)}</div><div className="custom-banner"><div><Heading level={2}>Need something a little different?</Heading><p>Tell us what you want to keep, remove or add. We’ll help shape a package around your event.</p></div><Button variant="secondary" onClick={() => go("explore")}>Customize Package</Button></div></main></>;
}

function Cart({
  go,
  items,
  notice,
  onQuantityChange,
  onRemove,
}: {
  go: (page: Page) => void;
  items: CartItem[];
  notice: string | null;
  onQuantityChange: (serviceId: string, quantity: number) => void;
  onRemove: (serviceId: string) => void;
}) {
  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  return <><PageHero title="Your Event Cart" text={`${items.length} ${items.length === 1 ? "service" : "services"} saved for your celebration.`} /><main className="shell cart-layout"><div className="cart-items">
    {notice && <p className="form-error" role="alert">{notice}</p>}
    {items.length === 0
      ? <div className="empty-state"><Heading level={2}>Your cart is empty</Heading><p>Explore events and add a service to get started.</p><Button onClick={() => go("explore")}>Explore Events</Button></div>
      : items.map((item) => <article className="cart-item" key={item.service_id}>
        {item.image && <img src={item.image} alt={item.name} />}
        <div><Heading level={3}>{item.name}</Heading><p>{item.vendor_name}</p><span>{item.event_type} · {item.city}</span><div className="quantity"><label>Quantity <select value={item.quantity} onChange={(event) => onQuantityChange(item.service_id, Number(event.target.value))}>{Array.from({ length: 10 }, (_, index) => index + 1).map((quantity) => <option key={quantity} value={quantity}>{quantity}</option>)}</select></label><button onClick={() => onRemove(item.service_id)}>Remove</button></div></div>
        <strong>₹{(item.price * item.quantity).toLocaleString("en-IN")}</strong>
      </article>)}
  </div><aside className="summary"><Heading level={2}>Order summary</Heading><p><span>Subtotal</span><strong>₹{subtotal.toLocaleString("en-IN")}</strong></p><p><span>Discount</span><strong className="green">₹0</strong></p><div><span>Total</span><strong>₹{subtotal.toLocaleString("en-IN")}</strong></div><Button full onClick={() => go("checkout")} disabled={items.length === 0}>Continue to Checkout</Button><Button full variant="text" onClick={() => go("explore")}>Continue browsing</Button></aside></main></>;
}

function Checkout({
  go,
  cartItems,
  customer,
  onConfirmBooking,
  submitting,
  bookingError,
}: {
  go: (page: Page) => void;
  cartItems: CartItem[];
  customer?: CustomerProfile | null;
  onConfirmBooking?: (payload: {
    eventType: string;
    eventDate: string;
    venue: string;
    phone: string;
  }) => Promise<void>;
  submitting?: boolean;
  bookingError?: string | null;
}) {
  const subtotal = cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const [eventType, setEventType] = useState(cartItems[0]?.event_type ?? "Birthday");
  const [eventDate, setEventDate] = useState("");
  const [venue, setVenue] = useState("");
  const [phone, setPhone] = useState(customer?.phone ?? "");
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    setPhone(customer?.phone ?? "");
  }, [customer]);

  const handleSubmit = async () => {
    if (cartItems.length === 0) {
      setValidationError("Your cart is empty. Add a service before continuing.");
      return;
    }
    if (!eventType || !eventDate || !venue.trim() || !phone.trim()) {
      setValidationError("Please enter the event type, event date, venue, and phone number.");
      return;
    }
    setValidationError(null);

    await onConfirmBooking?.({ eventType, eventDate, venue: venue.trim(), phone: phone.trim() });
  };

  return <><PageHero title="Confirm your booking" text="A few details and you’re done. Payment is arranged after the vendor confirms." /><div className="shell steps"><span className="active">1 <small>Event Details</small></span><i></i><span className="active">2 <small>Contact Details</small></span><i></i><span className="active">3 <small>Confirm Booking</small></span></div><main className="shell checkout-layout"><div className="checkout-form"><section><Heading level={2}>Event details</Heading><div className="form-grid"><SelectField label="Event type" value={eventType} onChange={(event) => setEventType(event.target.value)}>{eventOptions.map((option) => <option key={option}>{option}</option>)}</SelectField><Field label="Event date" type="date" value={eventDate} onChange={(event) => setEventDate(event.target.value)} required /><Field label="Venue address" value={venue} onChange={(event) => setVenue(event.target.value)} required /></div></section><section><Heading level={2}>Contact details</Heading><div className="form-grid"><Field label="Phone number" value={phone} onChange={(event) => setPhone(event.target.value)} required /></div></section><div className="payment-note"><strong>Payment after confirmation</strong><p>The vendor will confirm availability first. You’ll receive payment details after that.</p></div>{(validationError || bookingError) && <p className="form-error" role="alert">{validationError || bookingError}</p>}</div><aside className="summary"><Heading level={2}>Order summary</Heading>{cartItems.map((item) => <div className="summary-item" key={item.service_id}>{item.image && <img src={item.image} alt={item.name} />}<div><strong>{item.name} × {item.quantity}</strong><span>{item.vendor_name}</span></div></div>)}<p><span>Subtotal</span><strong>₹{subtotal.toLocaleString("en-IN")}</strong></p><p><span>Discount</span><strong className="green">₹0</strong></p><div><span>Total</span><strong>₹{subtotal.toLocaleString("en-IN")}</strong></div><Button full onClick={handleSubmit} disabled={submitting || cartItems.length === 0}>{submitting ? "Confirming..." : "Confirm Booking"}</Button><small>By confirming, you agree to Jashn’s booking terms.</small></aside></main></>;
}

function formatBookingDate(date: string) {
  const parsed = new Date(date);
  return Number.isNaN(parsed.getTime()) ? date : parsed.toLocaleString("en-IN", { dateStyle: "long" });
}

function Confirmation({ go, booking, loading }: { go: (page: Page) => void; booking: BookingRecord | null; loading: boolean }) {
  if (loading) {
    return <main className="confirmation shell"><div className="empty-state"><Heading level={2}>Loading booking confirmation…</Heading></div></main>;
  }
  if (!booking) {
    return <main className="confirmation shell"><Heading level={1}>Booking details unavailable</Heading><p>We could not load this booking. You can check your bookings for the latest details.</p><Button onClick={() => go("bookings")}>My Bookings</Button></main>;
  }
  return <main className="confirmation shell"><span className="success-mark"><Icon name="check" size={36} /></span><Badge tone="warning">{booking.status}</Badge><Heading level={1}>Your booking is confirmed!</Heading><p>Your booking has been saved. The vendor will respond after reviewing the request.</p><div className="confirmation-card"><div><span>Booking ID</span><strong>{booking.id}</strong></div><div><span>Event type</span><strong>{booking.event_type}</strong></div><div><span>Event date</span><strong>{formatBookingDate(booking.event_date)}</strong></div><div><span>Venue</span><strong>{booking.venue}</strong></div><div><span>Total amount</span><strong>₹{Number(booking.total_amount).toLocaleString("en-IN")}</strong></div><div><span>Status</span><strong>{booking.status}</strong></div></div><div className="button-row"><Button onClick={() => go("bookings")}>View Booking</Button><Button variant="secondary" onClick={() => go("home")}>Back to Home</Button></div></main>;
}

function MyBookings({ go, customer, onSelectBooking }: { go: (page: Page) => void; customer?: CustomerProfile | null; onSelectBooking: (booking: BookingRecord) => void }) {
  const [bookings, setBookings] = useState<BookingRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadBookings = async () => {
      if (!customer?.id) {
        setBookings([]);
        setError(null);
        return;
      }

      if (!supabase) {
        setBookings([]);
        setError("Supabase is not configured.");
        return;
      }

      try {
        setLoading(true);
        setError(null);
        const { data, error: bookingError } = await supabase
          .from("bookings")
          .select("id, customer_id, event_type, event_date, venue, phone, total_amount, status, payment_status, created_at")
          .eq("customer_id", customer.id)
          .order("created_at", { ascending: false });

        if (bookingError) {
          throw bookingError;
        }

        setBookings((data ?? []) as BookingRecord[]);
      } catch (bookingException) {
        console.error("Supabase booking list query failed", bookingException);
        setError("Unable to load your bookings right now.");
        setBookings([]);
      } finally {
        setLoading(false);
      }
    };

    loadBookings();
  }, [customer]);

  if (!customer) {
    return <><PageHero title="My Bookings" text="Keep track of your event plans and vendor updates." /><main className="shell dashboard-page"><div className="empty-state"><Heading level={2}>No bookings yet.</Heading><p>Explore events and book your first celebration.</p><Button onClick={() => go("explore")}>Explore Events</Button></div></main></>;
  }

  if (loading) {
    return <><PageHero title="My Bookings" text="Loading your reservations." /><main className="shell dashboard-page"><div className="empty-state"><Heading level={2}>Loading bookings…</Heading></div></main></>;
  }

  if (error) {
    return <><PageHero title="My Bookings" text="We could not load your bookings." /><main className="shell dashboard-page"><div className="empty-state"><Heading level={2}>Something went wrong</Heading><p>{error}</p><Button onClick={() => go("explore")}>Explore Events</Button></div></main></>;
  }

  if (bookings.length === 0) {
    return <><PageHero title="My Bookings" text="Keep track of your event plans and vendor updates." /><main className="shell dashboard-page"><div className="empty-state"><Heading level={2}>No bookings yet.</Heading><p>Explore events and book your first celebration.</p><Button onClick={() => go("explore")}>Explore Events</Button></div></main></>;
  }

  return <><PageHero title="My Bookings" text="Keep track of your event plans and vendor updates." /><main className="shell dashboard-page"><div className="booking-list">{bookings.map((booking) => <button className="booking-row" key={booking.id} onClick={() => onSelectBooking(booking)}><div className="date-tile"><strong>{new Date(booking.event_date).getDate()}</strong><span>{new Date(booking.event_date).toLocaleString("en-IN", { month: "short" })}</span></div><div><Heading level={3}>{booking.event_type}</Heading><p>{booking.venue}</p><small>Booking ID: {booking.id}</small></div><div><span>Total</span><strong>₹{Number(booking.total_amount).toLocaleString("en-IN")}</strong></div><Badge tone={booking.status === "completed" ? "success" : "warning"}>{booking.status}</Badge><Icon name="arrow" /></button>)}</div></main></>;
}

function CustomerProfile({ go, customer, onLogout }: { go: (page: Page) => void; customer?: CustomerProfile | null; onLogout?: () => void }) {
  if (!customer) {
    return <><PageHero title="Your Profile" text="Manage your details and saved addresses." /><main className="shell profile-layout"><div className="empty-state"><Heading level={2}>Please log in</Heading><Button onClick={() => go("login")}>Go to login</Button></div></main></>;
  }

  return <><PageHero title="Your Profile" text="Manage your details and saved addresses." /><main className="shell profile-layout"><aside className="profile-side"><span className="avatar-text">{customer.name.slice(0, 2).toUpperCase()}</span><Heading level={3}>{customer.name}</Heading><p>Customer since {new Date(customer.created_at ?? Date.now()).toLocaleDateString("en-IN", { month: "long", year: "numeric" })}</p><nav><button className="active">Profile information</button><button>Saved addresses</button><button onClick={() => go("bookings")}>Past bookings</button><button onClick={onLogout ?? (() => go("login"))}>Log out</button></nav></aside><div className="profile-main"><section><div className="title-action"><Heading level={2}>Profile information</Heading><Button variant="secondary">Edit Profile</Button></div><div className="info-grid"><p><span>Name</span><strong>{customer.name}</strong></p><p><span>Email</span><strong>{customer.email}</strong></p><p><span>Phone</span><strong>{customer.phone || "Not provided"}</strong></p></div></section><section><div className="title-action"><Heading level={2}>Saved addresses</Heading><Button variant="text">Add address</Button></div><div className="address-card"><Badge>Home</Badge><strong>{customer.name}</strong><p>Flat 6B, Mayur Colony, Kothrud<br/>Pune, Maharashtra 411038</p></div></section></div></main></>;
}

function Auth({
  mode,
  go,
  authMessage,
  onLogin,
  onSignup,
}: {
  mode: "login" | "signup";
  go: (page: Page) => void;
  authMessage?: string | null;
  onLogin?: (email: string, password: string) => Promise<void>;
  onSignup?: (name: string, email: string, phone: string, password: string) => Promise<void>;
}) {
  const signup = mode === "signup";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(authMessage ?? null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setError(authMessage ?? null);
  }, [authMessage]);

  const handleSubmit = async () => {
    if (!email.trim() || !password.trim()) {
      setError(signup ? "Please complete all required fields." : "Please enter your email and password.");
      return;
    }

    if (signup && (!fullName.trim() || !phone.trim())) {
      setError("Please complete your name and phone number.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      if (signup && onSignup) {
        await onSignup(fullName.trim(), email.trim(), phone.trim(), password);
      } else if (onLogin) {
        await onLogin(email.trim(), password);
      }
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : "Unable to continue right now.");
    } finally {
      setLoading(false);
    }
  };

  return <main className="auth-page"><section className="auth-visual"><img src={signup ? photos.family : photos.weddingWide} alt="A joyful Indian celebration" /><div><span>Jashn</span><Heading level={2}>{signup ? "There’s always something worth celebrating." : "Your next celebration is closer than you think."}</Heading></div></section><section className="auth-form"><Logo go={go} /><div><span className="eyebrow">{signup ? "Customer account" : "Customer login"}</span><Heading level={1}>{signup ? "Join Jashn" : "Welcome back"}</Heading><p>{signup ? "A short form, then you can start planning." : "Log in to manage bookings and saved services."}</p></div>{signup && <Field label="Full name" placeholder="Your full name" value={fullName} onChange={(event) => setFullName(event.target.value)} required />}
      <Field label="Email address" type="email" placeholder="you@example.com" value={email} onChange={(event) => setEmail(event.target.value)} required />
      {signup && <Field label="Phone number" placeholder="+91 98765 43210" value={phone} onChange={(event) => setPhone(event.target.value)} required />}
      <Field label="Password" type="password" placeholder="At least 8 characters" value={password} onChange={(event) => setPassword(event.target.value)} required />
      {!signup && <button className="forgot">Forgot password?</button>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <Button full onClick={handleSubmit} disabled={loading}>{loading ? (signup ? "Creating account..." : "Logging in...") : (signup ? "Create Customer Account" : "Log In")}</Button>
      {!signup && <div className="account-switch"><span>Continue as</span><button className="active">Customer</button><button onClick={() => go("vendor-login")}>Vendor</button></div>}
      <p className="auth-link">{signup ? "Already have an account?" : "Don’t have an account?"} <button onClick={() => go(signup ? "login" : "signup")}>{signup ? "Log in" : "Create account"}</button></p>{signup && <p className="auth-link">Offering event services? <button onClick={() => go("vendor-register")}>Register as a vendor</button></p>}</section></main>;
}

function RoleAuth({
  role,
  mode,
  go,
  authMessage,
  onVendorLogin,
  onVendorRegister,
  onAdminLogin,
}: {
  role: "vendor" | "admin";
  mode: "login" | "register";
  go: (page: Page) => void;
  authMessage?: string | null;
  onVendorLogin?: (email: string, password: string) => Promise<void>;
  onVendorRegister?: (details: { businessName: string; ownerName: string; phone: string; category: string; city: string; email: string; password: string }) => Promise<void>;
  onAdminLogin?: (email: string, password: string) => Promise<void>;
}) {
  const vendor = role === "vendor";
  const register = mode === "register";
  const [businessName, setBusinessName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [phone, setPhone] = useState("");
  const [category, setCategory] = useState("Decoration");
  const [city, setCity] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setError(authMessage ?? null);
  }, [authMessage]);

  const submit = async () => {
    setError(null);
    setLoading(true);
    try {
      if (vendor && register && onVendorRegister) {
        await onVendorRegister({ businessName: businessName.trim(), ownerName: ownerName.trim(), phone: phone.trim(), category, city: city.trim(), email: email.trim(), password });
      } else if (vendor && onVendorLogin) {
        await onVendorLogin(email.trim(), password);
      } else if (!vendor && onAdminLogin) {
        await onAdminLogin(email.trim(), password);
      } else {
        throw new Error("This login method is not available.");
      }
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to continue right now.");
    } finally {
      setLoading(false);
    }
  };

  return <main className="auth-page">
    <section className="auth-visual"><img src={vendor ? photos.birthday : photos.event} alt={vendor ? "Event decoration by a local vendor" : "Celebration venue"} /><div><span>Jashn {vendor ? "for Vendors" : "Admin"}</span><Heading level={2}>{vendor ? "Grow your business with celebrations nearby." : "Keep the Jashn marketplace safe and reliable."}</Heading></div></section>
    <section className="auth-form"><Logo go={go} /><div><span className="eyebrow">{vendor ? "Vendor workspace" : "Secure admin access"}</span><Heading level={1}>{register ? "Register your business" : vendor ? "Vendor login" : "Admin login"}</Heading><p>{register ? "Tell us the basics. Our team will review your application." : "Enter your account details to continue."}</p></div>
      {register && <><Field label="Business name" placeholder="Your registered or trading name" value={businessName} onChange={(event) => setBusinessName(event.target.value)} required /><Field label="Owner name" placeholder="Full name" value={ownerName} onChange={(event) => setOwnerName(event.target.value)} required /><Field label="Phone number" placeholder="+91 98765 43210" value={phone} onChange={(event) => setPhone(event.target.value)} required /><SelectField label="Primary category" value={category} onChange={(event) => setCategory(event.target.value)}><option>Decoration</option><option>Catering</option><option>Photography</option><option>Entertainment</option><option>Planning</option></SelectField><Field label="City" placeholder="e.g. Pune" value={city} onChange={(event) => setCity(event.target.value)} required /></>}
      <Field label="Email address" type="email" placeholder={vendor ? "business@example.com" : "admin@jashn.in"} value={email} onChange={(event) => setEmail(event.target.value)} required /><Field label="Password" type="password" placeholder="At least 8 characters" value={password} onChange={(event) => setPassword(event.target.value)} required />
      {!register && <button className="forgot">Forgot password?</button>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <Button full onClick={submit} disabled={loading}>{loading ? "Please wait..." : register ? "Submit for Approval" : "Log In"}</Button>
      {vendor && <p className="auth-link">{register ? "Already registered?" : "New to Jashn?"} <button onClick={() => go(register ? "vendor-login" : "vendor-register")}>{register ? "Vendor login" : "Register your business"}</button></p>}
      {!vendor && <p className="auth-link"><button onClick={() => go("home")}>Back to customer website</button></p>}
    </section>
  </main>;
}

function VendorPending({ go, vendor, status = "pending", message }: { go: (page: Page) => void; vendor?: VendorRecord | null; status?: string; message?: string | null }) {
  const rejected = status.toLowerCase() === "rejected";
  const suspended = status.toLowerCase() === "suspended";
  const pending = status.toLowerCase() === "pending";
  const title = pending ? "Your application is under review" : rejected ? "Your application was not approved" : suspended ? "Vendor access is suspended" : "Vendor access unavailable";
  const label = pending ? "Approval pending" : rejected ? "Application rejected" : suspended ? "Account suspended" : status;
  return <main className="confirmation shell"><span className="pending-mark"><Icon name="calendar" size={32} /></span><Badge tone={pending ? "warning" : "danger"}>{label}</Badge><Heading level={1}>{title}</Heading><p>{message ?? (pending
    ? "The Jashn team will review your business details before your vendor dashboard is activated."
    : "Please contact Jashn support if you believe this status is incorrect.")}</p>{vendor && <div className="confirmation-card"><div><span>Business</span><strong>{vendor.business_name}</strong></div><div><span>City</span><strong>{vendor.city}</strong></div><div><span>Status</span><Badge tone={pending ? "warning" : "danger"}>{vendor.status}</Badge></div></div>}<div className="button-row"><Button onClick={() => go("vendor-login")}>Go to Vendor Login</Button><Button variant="secondary" onClick={() => go("home")}>Back to Home</Button></div></main>;
}

type VendorAccess = { profile: CustomerProfile; vendor: VendorRecord };

function VendorAccessGate({ page, go, children }: { page: Page; go: (page: Page) => void; children: (access: VendorAccess) => ReactNode }) {
  const [access, setAccess] = useState<VendorAccess | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setAccess(null);
      setStatus(null);
      setError(null);
      if (!supabase) {
        setError("Supabase is not configured.");
        setLoading(false);
        return;
      }
      try {
        const { data: { user }, error: userError } = await supabase.auth.getUser();
        if (userError) throw userError;
        if (!user) {
          go("vendor-login");
          return;
        }
        const { data: profile, error: profileError } = await supabase
          .from("profiles").select("id,name,email,phone,role").eq("id", user.id).maybeSingle();
        if (profileError) throw profileError;
        if (!profile || profile.role !== "vendor") {
          await supabase.auth.signOut();
          go("vendor-login");
          setError("This account is not registered as a vendor.");
          return;
        }
        const { data: vendor, error: vendorError } = await supabase
          .from("vendors").select("id,auth_user_id,business_name,city,status")
          .eq("auth_user_id", user.id).maybeSingle();
        if (vendorError) throw vendorError;
        if (!vendor) {
          setError("No vendor application is linked to this account. Contact Jashn support.");
          setLoading(false);
          return;
        }
        if (!active) return;
        const normalizedStatus = String(vendor.status ?? "").toLowerCase();
        if (!["approved", "active"].includes(normalizedStatus)) {
          setStatus(normalizedStatus || "unknown");
          setAccess({ profile: profile as CustomerProfile, vendor: vendor as VendorRecord });
        } else {
          setAccess({ profile: profile as CustomerProfile, vendor: vendor as VendorRecord });
        }
      } catch (loadError) {
        console.error("Unable to load vendor access", loadError);
        if (active) setError(loadError instanceof Error ? loadError.message : "Unable to verify vendor access.");
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => { active = false; };
  }, [page]);

  if (loading) return <main className="confirmation shell"><Heading level={1}>Verifying vendor access…</Heading></main>;
  if (status && access) return <VendorPending go={go} vendor={access.vendor} status={status} />;
  if (error || !access) return <main className="confirmation shell"><Badge tone="danger">Vendor access unavailable</Badge><Heading level={1}>Unable to open vendor workspace</Heading><p>{error ?? "Please log in with an approved vendor account."}</p><div className="button-row"><Button onClick={() => go("vendor-login")}>Vendor Login</Button><Button variant="secondary" onClick={() => go("home")}>Back to Home</Button></div></main>;
  return <>{children(access)}</>;
}

type AdminAccess = { profile: CustomerProfile };

type AdminVendorRow = {
  id: string;
  auth_user_id: string | null;
  business_name: string;
  city: string;
  status: string;
  created_at: string;
  owner: Pick<CustomerProfile, "name" | "email"> | null;
};

type AdminBookingRow = BookingRecord & {
  customer: Pick<CustomerProfile, "name" | "email"> | null;
  vendorNames: string[];
};

type AdminServiceRow = {
  id: string;
  name: string;
  vendor_id: string;
  category: string | null;
  price: number | string;
  event_types: string[] | string | null;
  status: string;
  vendor_name: string;
};

async function verifyAdminSession() {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  if (!user) throw new Error("Your admin session has expired. Please log in again.");
  const { data: profile, error: profileError } = await supabase
    .from("profiles").select("id,role").eq("id", user.id).maybeSingle();
  if (profileError) throw profileError;
  if (profile?.role !== "admin") throw new Error("You do not have permission to perform this admin action.");
  return user.id;
}

function adminDatabaseErrorMessage(error: unknown): string {
  if (!error || typeof error !== "object") {
    return error instanceof Error ? error.message : "Supabase request failed.";
  }
  const fields = error as { message?: unknown; code?: unknown; details?: unknown; hint?: unknown };
  const message = typeof fields.message === "string" ? fields.message : "Supabase request failed.";
  const context = [
    typeof fields.code === "string" ? `code ${fields.code}` : null,
    typeof fields.details === "string" ? fields.details : null,
    typeof fields.hint === "string" ? `hint: ${fields.hint}` : null,
  ].filter(Boolean);
  return context.length ? `${message} (${context.join("; ")})` : message;
}

function AdminAccessGate({ page, go, children }: { page: Page; go: (page: Page) => void; children: (access: AdminAccess) => ReactNode }) {
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setProfile(null);
      setError(null);
      if (!supabase) {
        setError("Supabase is not configured.");
        setLoading(false);
        return;
      }
      try {
        const { data: { user }, error: userError } = await supabase.auth.getUser();
        if (userError?.name === "AuthSessionMissingError") {
          go("admin-login");
          return;
        }
        if (userError) throw userError;
        console.log("Authenticated user:", user);
        if (!user) {
          go("admin-login");
          return;
        }
        const { data: loadedProfile, error: profileError } = await supabase
          .from("profiles").select("*").eq("id", user.id).maybeSingle();
        if (profileError) throw profileError;
        console.log("Loaded profile:", loadedProfile);
        console.log("Loaded role:", loadedProfile?.role);
        if (!loadedProfile || loadedProfile.role !== "admin") {
          if (active) {
            setError("You do not have permission to access the admin workspace.");
            if (loadedProfile?.role === "vendor") go("vendor-dashboard");
            else go("home");
          }
          return;
        }
        if (active) setProfile(loadedProfile as CustomerProfile);
      } catch (loadError) {
        console.error("Unable to verify admin access", loadError);
        if (active) setError(loadError instanceof Error ? loadError.message : "Unable to verify admin access.");
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => { active = false; };
  }, [page]);
  if (loading) return <main className="confirmation shell"><Heading level={1}>Verifying admin access…</Heading></main>;
  if (error || !profile) return <main className="confirmation shell"><Badge tone="danger">Admin access denied</Badge><Heading level={1}>Unable to open the admin workspace</Heading><p>{error ?? "Sign in with an admin account to continue."}</p><div className="button-row"><Button onClick={() => go("admin-login")}>Admin Login</Button><Button variant="secondary" onClick={() => go("home")}>Back to Home</Button></div></main>;
  return <>{children({ profile })}</>;
}

async function loadVendorBookings(vendorId: string): Promise<VendorBooking[]> {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { data: items, error: itemsError } = await supabase
    .from("booking_items")
    .select("id,booking_id,service_id,quantity,price")
    .eq("vendor_id", vendorId);
  if (itemsError) {
    console.error("Unable to load vendor booking items", itemsError);
    throw itemsError;
  }
  if (!items?.length) return [];

  const bookingIds = [...new Set(items.map((item) => item.booking_id))];
  const serviceIds = [...new Set(items.map((item) => item.service_id))];
  const { data: bookings, error: bookingsError } = await supabase
    .from("bookings")
    .select("id,customer_id,event_type,event_date,venue,phone,total_amount,status,payment_status,created_at")
    .in("id", bookingIds)
    .order("created_at", { ascending: false });
  if (bookingsError) {
    console.error("Unable to load vendor booking details", bookingsError);
    throw bookingsError;
  }
  const customerIds = [...new Set((bookings ?? []).map((booking) => booking.customer_id))];
  const { data: servicesData, error: servicesError } = await supabase
    .from("services").select("id,name").in("id", serviceIds);
  if (servicesError) {
    console.error("Unable to load vendor booking services", servicesError);
    throw servicesError;
  }
  const { data: profiles, error: profilesError } = customerIds.length
    ? await supabase.from("profiles").select("id,name,email,phone").in("id", customerIds)
    : { data: [], error: null };
  if (profilesError) {
    console.error("Unable to load booking customer details", profilesError);
    throw profilesError;
  }

  const bookingsById = new Map((bookings ?? []).map((booking) => [booking.id, booking as BookingRecord]));
  const servicesById = new Map((servicesData ?? []).map((service) => [service.id, service.name as string]));
  const profilesById = new Map((profiles ?? []).map((profile) => [profile.id, profile as CustomerProfile]));
  return (items ?? []).flatMap((item) => {
    const booking = bookingsById.get(item.booking_id);
    if (!booking) return [];
    return [{
      booking,
      customer: profilesById.get(booking.customer_id) ?? null,
      items: [{
        id: item.id,
        service_id: item.service_id,
        service_name: servicesById.get(item.service_id) ?? "Service details unavailable",
        quantity: Number(item.quantity),
        price: item.price,
      }],
    }];
  });
}

function SideNav({ role, page, go, vendorName }: { role: "vendor" | "admin"; page: Page; go: (page: Page) => void; vendorName?: string }) {
  const vendor = [["Dashboard","vendor-dashboard"],["Bookings","vendor-bookings"],["Services","vendor-services"],["Portfolio","vendor-portfolio"],["Profile","vendor-profile"]] as [string,Page][];
  const admin = [["Dashboard","admin-dashboard"],["Vendors","admin-vendors"],["Users","admin-users"],["Bookings","admin-bookings"],["Services","admin-services"]] as [string,Page][];
  const displayName = role === "vendor" ? (vendorName || "Vendor") : "Administrator";
  return <aside className="side-nav"><Logo go={go} /><div className="workspace-label">{role === "vendor" ? "Vendor workspace" : "Admin workspace"}</div><nav>{(role === "vendor" ? vendor : admin).map(([label,target]) => <button key={label} className={page===target?"active":""} onClick={() => go(target)}>{label}<Icon name="arrow" size={16} /></button>)}</nav><div className="side-user"><span>{role === "vendor" ? displayName.slice(0, 2).toUpperCase() : "AD"}</span><div><strong>{displayName}</strong><button onClick={() => go("home")}>Back to website</button></div></div></aside>;
}

function Workspace({ role, page, go, children, vendorName }: { role: "vendor" | "admin"; page: Page; go: (page: Page) => void; children: ReactNode; vendorName?: string }) {
  return <div className="workspace"><SideNav role={role} page={page} go={go} vendorName={vendorName} /><main className="workspace-main">{children}</main></div>;
}

function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return <article className="stat-card"><span>{label}</span><strong>{value}</strong><small>{note}</small></article>;
}

function WorkspaceTop({ eyebrow, title, text, action }: { eyebrow: string; title: string; text?: string; action?: ReactNode }) {
  return <div className="workspace-top"><div><span className="eyebrow">{eyebrow}</span><Heading level={1}>{title}</Heading>{text && <p>{text}</p>}</div>{action}</div>;
}

function RecentBookings({ vendor = false }: { vendor?: boolean }) {
  return <div className="table-wrap"><div className="table-title"><Heading level={2}>Recent bookings</Heading><button>View all</button></div><table><thead><tr><th>{vendor ? "Customer" : "Booking ID"}</th><th>Event</th><th>Date</th><th>Amount</th><th>Status</th><th></th></tr></thead><tbody>{[["Priya Sharma","Birthday Decoration","25 Oct","₹7,500","New"],["Ankit Rao","Anniversary Dinner","12 Dec","₹16,999","Accepted"],["Neha Joshi","Baby Shower Decor","18 Dec","₹9,500","Confirmed"]].map((r,i)=><tr key={r[0]}><td><strong>{vendor ? r[0] : `JAS-482${i}`}</strong></td><td>{r[1]}</td><td>{r[2]}</td><td>{r[3]}</td><td><Badge tone={i===0?"warning":"success"}>{r[4]}</Badge></td><td><button className="table-link">View details</button></td></tr>)}</tbody></table></div>;
}

function VendorDashboard({ page, go, vendor, profile }: { page: Page; go: (page: Page) => void; vendor: VendorRecord; profile: CustomerProfile }) {
  const [bookings, setBookings] = useState<VendorBooking[]>([]);
  const [servicesCount, setServicesCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    const load = async () => {
      if (!supabase) return;
      try {
        const [vendorBookings, servicesResult] = await Promise.all([
          loadVendorBookings(vendor.id),
          supabase.from("services").select("id", { count: "exact", head: true }).eq("vendor_id", vendor.id).eq("status", "active"),
        ]);
        if (servicesResult.error) throw servicesResult.error;
        if (active) {
          setBookings(vendorBookings);
          setServicesCount(servicesResult.count ?? 0);
        }
      } catch (loadError) {
        console.error("Unable to load vendor dashboard", loadError);
        if (active) setError(loadError instanceof Error ? loadError.message : "Unable to load dashboard data.");
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => { active = false; };
  }, [vendor.id]);
  const uniqueBookings = [...new Map(bookings.map((entry) => [entry.booking.id, entry.booking])).values()];
  const countStatus = (status: string) => uniqueBookings.filter((booking) => booking.status.toLowerCase() === status).length;
  const amount = (value: number | string) => `₹${Number(value).toLocaleString("en-IN")}`;
  return <Workspace role="vendor" page={page} go={go} vendorName={vendor.business_name}><WorkspaceTop eyebrow="Vendor workspace" title={`Good morning, ${vendor.business_name}`} text="Here’s what needs your attention today." />
    {error && <p className="form-error" role="alert">{error}</p>}
    {loading ? <p>Loading dashboard…</p> : <>
      <div className="stats-grid"><Stat label="Total bookings" value={String(uniqueBookings.length)} note="All bookings for your services" /><Stat label="Pending bookings" value={String(countStatus("pending"))} note="Awaiting your response" /><Stat label="Accepted bookings" value={String(countStatus("accepted"))} note="Ready to complete" /><Stat label="Completed bookings" value={String(countStatus("completed"))} note={`${servicesCount} active services`} /></div>
      <div className="table-wrap"><div className="table-title"><Heading level={2}>Recent bookings</Heading><Button variant="text" onClick={() => go("vendor-bookings")}>View all</Button></div>
        {uniqueBookings.length ? <table><thead><tr><th>Booking ID</th><th>Customer</th><th>Event</th><th>Date</th><th>Total</th><th>Status</th></tr></thead><tbody>{uniqueBookings.slice(0, 5).map((booking) => <tr key={booking.id}><td><strong>{booking.id}</strong></td><td>{bookings.find((entry) => entry.booking.id === booking.id)?.customer?.name ?? "Customer"}</td><td>{booking.event_type}</td><td>{new Date(booking.event_date).toLocaleDateString("en-IN")}</td><td>{amount(booking.total_amount)}</td><td><Badge tone={booking.status === "pending" ? "warning" : "success"}>{booking.status}</Badge></td></tr>)}</tbody></table> : <div className="empty-state">No bookings yet.</div>}
      </div>
    </>}
    <div className="dashboard-note"><div><Heading level={3}>Keep your calendar updated</Heading><p>Manage services and respond to bookings from this workspace.</p></div><Button variant="secondary" onClick={() => go("vendor-services")}>Manage services</Button></div>
  </Workspace>;
}

function VendorBookings({ page, go, vendor }: { page: Page; go: (page: Page) => void; vendor: VendorRecord }) {
  const [tab, setTab] = useState("pending");
  const [bookings, setBookings] = useState<VendorBooking[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const reload = async () => {
    setLoading(true);
    try {
      const result = await loadVendorBookings(vendor.id);
      setBookings(result);
      setError(null);
    } catch (loadError) {
      console.error("Unable to load vendor bookings", loadError);
      setError(loadError instanceof Error ? loadError.message : "Unable to load bookings.");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { reload(); }, [vendor.id]);
  const updateStatus = async (record: BookingRecord, nextStatus: "accepted" | "rejected" | "completed") => {
    const allowed = (record.status === "pending" && ["accepted", "rejected"].includes(nextStatus))
      || (record.status === "accepted" && nextStatus === "completed");
    if (!allowed || !supabase) return;
    setSavingId(record.id);
    setError(null);
    try {
      const { error: rpcError } = await supabase.rpc("vendor_set_booking_status", {
        p_booking_id: record.id,
        p_status: nextStatus,
      });
      if (rpcError) {
        console.error("Unable to update vendor booking status", rpcError);
        setError(rpcError.message || "Unable to update this booking.");
        return;
      }
      await reload();
    } catch (statusError) {
      console.error("Unable to update vendor booking status", statusError);
      setError(statusError instanceof Error ? statusError.message : "Unable to update this booking.");
    } finally {
      setSavingId(null);
    }
  };
  const shown = bookings.filter((entry) => entry.booking.status.toLowerCase() === tab);
  const money = (value: number | string) => `₹${Number(value).toLocaleString("en-IN")}`;
  return <Workspace role="vendor" page={page} go={go} vendorName={vendor.business_name}><WorkspaceTop eyebrow="Bookings" title="Manage booking requests" text="Respond to bookings associated with your services." />
    <div className="tabs">{[["pending", "Pending"], ["accepted", "Accepted"], ["completed", "Completed"], ["rejected", "Rejected"]].map(([key, label]) => <button key={key} className={tab === key ? "active" : ""} onClick={() => setTab(key)}>{label}</button>)}</div>
    {error && <p className="form-error" role="alert">{error}</p>}
    {loading ? <p>Loading bookings…</p> : shown.length ? <div className="request-list">{shown.map((entry) => <article className="request-card" key={`${entry.booking.id}-${entry.items[0]?.id}`}><div><Badge tone="wine">{entry.booking.event_type}</Badge><Heading level={3}>{entry.customer?.name ?? "Customer"}</Heading><p>Booking ID: {entry.booking.id}</p><p><Icon name="calendar" size={17}/>{new Date(entry.booking.event_date).toLocaleDateString("en-IN")} &nbsp; <Icon name="pin" size={17}/>{entry.booking.venue}</p><p>Phone: {entry.booking.phone}</p><p>Service: {entry.items[0]?.service_name} · Qty {entry.items[0]?.quantity} · {money(entry.items[0]?.price ?? 0)}</p><p>Status: {entry.booking.status}</p></div><strong>{money(entry.booking.total_amount)}</strong><div className="request-actions">{entry.booking.status === "pending" && <><Button disabled={savingId === entry.booking.id} onClick={() => updateStatus(entry.booking, "accepted")}>Accept</Button><Button variant="danger" disabled={savingId === entry.booking.id} onClick={() => updateStatus(entry.booking, "rejected")}>Reject</Button></>}{entry.booking.status === "accepted" && <Button disabled={savingId === entry.booking.id} onClick={() => updateStatus(entry.booking, "completed")}>Mark Completed</Button>}</div></article>)}</div> : <div className="empty-state">No {tab} bookings.</div>}
  </Workspace>;
}

type ServiceDraft = { name: string; description: string; category: string; price: string; image: string; eventTypes: string; status: string };
const emptyServiceDraft: ServiceDraft = { name: "", description: "", category: "Decoration", price: "", image: "", eventTypes: "", status: "active" };
const serviceImageBucket = "service-images";
const serviceImageMaxBytes = 5 * 1024 * 1024;
const serviceImageTypes: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

function VendorServices({ page, go, vendor }: { page: Page; go: (page: Page) => void; vendor: VendorRecord }) {
  const [items, setItems] = useState<VendorService[]>([]);
  const [draft, setDraft] = useState<ServiceDraft>(emptyServiceDraft);
  const [selectedImageFile, setSelectedImageFile] = useState<File | null>(null);
  const [selectedImagePreview, setSelectedImagePreview] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const unsupportedCategory = Boolean(draft.category) && !categoryOptions.includes(draft.category);
  const vendorCity = vendor.city?.trim() ?? "";
  useEffect(() => {
    if (!selectedImageFile) {
      setSelectedImagePreview(null);
      return;
    }
    const previewUrl = URL.createObjectURL(selectedImageFile);
    setSelectedImagePreview(previewUrl);
    return () => URL.revokeObjectURL(previewUrl);
  }, [selectedImageFile]);

  const load = async () => {
    setLoading(true);
    try {
      if (!supabase) throw new Error("Supabase is not configured.");
      const { data, error: queryError } = await supabase.from("services")
        .select("id,vendor_id,name,description,category,price,image,event_types,status")
        .eq("vendor_id", vendor.id).order("created_at", { ascending: false });
      if (queryError) throw queryError;
      setItems((data ?? []) as VendorService[]);
      setError(null);
    } catch (loadError) {
      console.error("Unable to load vendor services", loadError);
      setError(loadError instanceof Error ? loadError.message : "Unable to load services.");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, [vendor.id]);
  const beginEdit = (item: VendorService) => {
    setEditingId(item.id);
    setSelectedImageFile(null);
    setDraft({ name: item.name, description: item.description ?? "", category: item.category ?? "", price: String(item.price), image: item.image ?? "", eventTypes: normalizeEventTypes(item.event_types).join(", "), status: item.status });
    setFormOpen(true);
  };
  const selectImage = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    event.target.value = "";
    if (!Object.prototype.hasOwnProperty.call(serviceImageTypes, file.type)) {
      setError("Choose a JPEG, PNG, or WebP image.");
      return;
    }
    if (file.size > serviceImageMaxBytes) {
      setError("The image must be 5 MB or smaller.");
      event.target.value = "";
      return;
    }
    setError(null);
    setSelectedImageFile(file);
  };
  const clearImage = () => {
    setSelectedImageFile(null);
    setDraft((current) => ({ ...current, image: "" }));
  };
  const save = async () => {
    if (!supabase || !draft.name.trim() || !categoryOptions.includes(draft.category) || !Number.isFinite(Number(draft.price)) || Number(draft.price) < 0 || !vendorCity) {
      setError(!vendorCity
        ? "Your vendor profile does not have a city. Please contact Jashn support before saving a service."
        : unsupportedCategory
          ? "This service has an unsupported category. Choose a category from the list before saving."
          : "Enter a service name, supported category, and valid non-negative price.");
      return;
    }
    setSaving(true);
    setError(null);
    let uploadedImagePath: string | null = null;
    try {
      let imageUrl = draft.image.trim() || null;
      if (selectedImageFile) {
        const { data: authData, error: authError } = await supabase.auth.getUser();
        if (authError) throw new Error(`Unable to verify your vendor account: ${authError.message}`);
        if (!authData.user) throw new Error("Sign in to your vendor account before uploading an image.");

        const { data: ownedVendor, error: vendorError } = await supabase
          .from("vendors")
          .select("id")
          .eq("id", vendor.id)
          .eq("auth_user_id", authData.user.id)
          .maybeSingle();
        if (vendorError) throw new Error(`Unable to verify vendor ownership: ${vendorError.message}`);
        if (!ownedVendor) throw new Error("This vendor account does not own the selected vendor profile.");

        const extension = serviceImageTypes[selectedImageFile.type];
        const uploadPath = `${ownedVendor.id}/${crypto.randomUUID()}.${extension}`;
        const { error: uploadError } = await supabase.storage
          .from(serviceImageBucket)
          .upload(uploadPath, selectedImageFile, {
            contentType: selectedImageFile.type,
            upsert: false,
          });
        if (uploadError) throw new Error(`Image upload failed: ${uploadError.message}`);
        uploadedImagePath = uploadPath;
        imageUrl = supabase.storage.from(serviceImageBucket).getPublicUrl(uploadPath).data.publicUrl;
      }

      const payload = {
        name: draft.name.trim(),
        description: draft.description.trim() || null,
        category: draft.category,
        price: Number(draft.price),
        image: imageUrl,
        event_types: draft.eventTypes.split(/[;,]/).map((value) => value.trim()).filter(Boolean),
        status: draft.status,
      };
      const result = editingId
        ? await supabase.from("services").update(payload).eq("id", editingId).eq("vendor_id", vendor.id).select("id").single()
        : await supabase.from("services").insert({ ...payload, vendor_id: vendor.id }).select("id").single();
      if (result.error) throw result.error;
      setFormOpen(false);
      setEditingId(null);
      setSelectedImageFile(null);
      setDraft(emptyServiceDraft);
      await load();
    } catch (saveError) {
      console.error("Unable to save vendor service", saveError);
      let message = saveError instanceof Error ? saveError.message : "Unable to save service.";
      if (uploadedImagePath && supabase) {
        const { error: cleanupError } = await supabase.storage.from(serviceImageBucket).remove([uploadedImagePath]);
        if (cleanupError) {
          console.error("Unable to clean up uploaded service image after save failure", cleanupError);
          message = `${message} The uploaded image could not be cleaned up; please contact support if it remains unused.`;
        }
      }
      setError(message);
    } finally {
      setSaving(false);
    }
  };
  const changeStatus = async (item: VendorService) => {
    if (!supabase) return;
    const status = item.status === "active" ? "inactive" : "active";
    const { error: updateError } = await supabase.from("services").update({ status }).eq("id", item.id).eq("vendor_id", vendor.id);
    if (updateError) {
      console.error("Unable to change service status", updateError);
      setError(updateError.message || "Unable to update service status.");
    } else await load();
  };
  const remove = async (item: VendorService) => {
    if (!supabase || !window.confirm(`Delete ${item.name}?`)) return;
    const { error: deleteError } = await supabase.from("services").delete().eq("id", item.id).eq("vendor_id", vendor.id);
    if (deleteError) {
      console.error("Unable to delete vendor service", deleteError);
      setError(deleteError.message || "This service could not be deleted.");
    } else await load();
  };
  const set = (key: keyof ServiceDraft, value: string) => setDraft((current) => ({ ...current, [key]: value }));
  return <Workspace role="vendor" page={page} go={go} vendorName={vendor.business_name}><WorkspaceTop eyebrow="Services" title="Your services" text="Customers discover active services by event, category and vendor location. Keep your pricing, details and photos up to date." action={<Button onClick={() => { setEditingId(null); setDraft(emptyServiceDraft); setSelectedImageFile(null); setFormOpen(!formOpen); }}>Add Service</Button>} />
    {error && <p className="form-error" role="alert">{error}</p>}
    {formOpen && <section className="inline-form"><div className="title-action"><Heading level={2}>{editingId ? "Edit service" : "Add a new service"}</Heading><button onClick={() => setFormOpen(false)}><Icon name="close"/></button></div><div className="form-grid"><Field label="Service name" value={draft.name} onChange={(event) => set("name", event.target.value)} required /><SelectField label="Category" value={draft.category} onChange={(event) => set("category", event.target.value)}><option value="">Choose a category</option>{unsupportedCategory && <option value={draft.category}>{`Unsupported: ${draft.category}`}</option>}{categoryOptions.map((category) => <option key={category}>{category}</option>)}</SelectField><label className="field"><span>Location (vendor city)</span><input value={vendorCity || "City not set"} readOnly aria-readonly="true" />{!vendorCity && <small className="form-error">Your vendor profile has no city. Contact Jashn support.</small>}</label><Field label="Price (INR)" type="number" value={draft.price} onChange={(event) => set("price", event.target.value)} required /><label className="field service-image-field"><span>Service image</span><input type="file" accept="image/jpeg,image/png,image/webp" onChange={selectImage} disabled={saving} /><small>JPEG, PNG, or WebP. Maximum size 5 MB.</small>{(selectedImagePreview || draft.image) && <div className="service-image-preview"><img src={selectedImagePreview ?? draft.image} alt="Service image preview" /><button type="button" onClick={() => selectedImageFile ? setSelectedImageFile(null) : clearImage()} disabled={saving}>{selectedImageFile ? "Cancel replacement" : "Remove image"}</button></div>}</label><Field label="Event types (comma separated)" value={draft.eventTypes} onChange={(event) => set("eventTypes", event.target.value)} /><SelectField label="Status" value={draft.status} onChange={(event) => set("status", event.target.value)}><option value="active">Active</option><option value="inactive">Inactive</option></SelectField></div>{unsupportedCategory && <p className="form-error" role="alert">The saved category “{draft.category}” is not available in Explore. Select a supported category before saving.</p>}<label className="field"><span>Description</span><textarea value={draft.description} onChange={(event) => set("description", event.target.value)} /></label><Button disabled={saving || !vendorCity || unsupportedCategory} onClick={save}>{saving ? selectedImageFile ? "Uploading image…" : "Saving..." : "Save Service"}</Button></section>}
    {loading ? <p>Loading services…</p> : items.length ? <div className="workspace-services">{items.map((item) => <article key={item.id}>{item.image && <img src={item.image} alt={item.name}/>}<div><Badge tone={item.status === "active" ? "success" : "neutral"}>{item.status}</Badge><Heading level={3}>{item.name}</Heading><p>{item.category ?? "Uncategorized"} · {normalizeEventTypes(item.event_types).join(", ")}</p><strong>₹{Number(item.price).toLocaleString("en-IN")}</strong></div><div className="request-actions"><Button variant="secondary" onClick={() => beginEdit(item)}>Edit</Button><Button variant="secondary" onClick={() => changeStatus(item)}>{item.status === "active" ? "Deactivate" : "Activate"}</Button><Button variant="danger" onClick={() => remove(item)}>Delete</Button></div></article>)}</div> : <div className="empty-state">No services yet. Add your first service to get started.</div>}
  </Workspace>;
}

function VendorPortfolio({ page, go, vendor }: { page: Page; go: (page: Page) => void; vendor: VendorRecord }) {
  return <Workspace role="vendor" page={page} go={go} vendorName={vendor.business_name}><WorkspaceTop eyebrow="Portfolio" title="Show your best work" text="Customers use these photos to decide if your style suits their event."/><div className="empty-state">Portfolio uploads are not connected yet. A vendor-owned portfolio table and Supabase Storage bucket with vendor-scoped access policies are required before photos can be saved.</div></Workspace>;
}

function VendorEditProfile({ page, go, vendor, profile }: { page: Page; go: (page: Page) => void; vendor: VendorRecord; profile: CustomerProfile }) {
  return <Workspace role="vendor" page={page} go={go} vendorName={vendor.business_name}><WorkspaceTop eyebrow="Profile" title="Business profile" text="This information appears on your public vendor page."/><section className="profile-main vendor-form"><div className="info-grid"><p><span>Business name</span><strong>{vendor.business_name}</strong></p><p><span>Owner</span><strong>{profile.name}</strong></p><p><span>Phone</span><strong>{profile.phone || "Not provided"}</strong></p><p><span>Email</span><strong>{profile.email}</strong></p><p><span>Location</span><strong>{vendor.city}</strong></p><p><span>Vendor status</span><strong>{vendor.status}</strong></p></div></section></Workspace>;
}

function AdminDashboard({ page, go }: { page: Page; go: (page: Page) => void }) {
  const [counts, setCounts] = useState<Record<string, number> | null>(null);
  const [recentBookings, setRecentBookings] = useState<AdminBookingRow[]>([]);
  const [pendingVendors, setPendingVendors] = useState<AdminVendorRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        await verifyAdminSession();
        if (!supabase) return;
        const queries = await Promise.all([
          supabase.from("vendors").select("id", { count: "exact", head: true }),
          supabase.from("vendors").select("id", { count: "exact", head: true }).eq("status", "pending"),
          supabase.from("vendors").select("id", { count: "exact", head: true }).eq("status", "approved"),
          supabase.from("vendors").select("id", { count: "exact", head: true }).eq("status", "rejected"),
          supabase.from("profiles").select("id", { count: "exact", head: true }).eq("role", "customer"),
          supabase.from("bookings").select("id", { count: "exact", head: true }),
          supabase.from("bookings").select("id", { count: "exact", head: true }).eq("status", "pending"),
          supabase.from("bookings").select("id", { count: "exact", head: true }).eq("status", "completed"),
          supabase.from("services").select("id", { count: "exact", head: true }).eq("status", "active"),
        ]);
        const failed = queries.find((result) => result.error);
        if (failed?.error) throw failed.error;
        const [vendors, pending, approved, rejected, customers, bookings, pendingBookings, completed, services] = queries;
        const [bookingResult, vendorResult] = await Promise.all([
          supabase.from("bookings").select("id,customer_id,event_type,event_date,venue,phone,total_amount,status,payment_status,created_at")
            .order("created_at", { ascending: false }).limit(5),
          supabase.from("vendors").select("id,auth_user_id,business_name,city,status,created_at")
            .eq("status", "pending").order("created_at", { ascending: false }).limit(5),
        ]);
        if (bookingResult.error) throw bookingResult.error;
        if (vendorResult.error) throw vendorResult.error;
        const bookingCustomers = [...new Set((bookingResult.data ?? []).map((row) => row.customer_id))];
        const vendorOwners = [...new Set((vendorResult.data ?? []).map((row) => row.auth_user_id).filter((id): id is string => Boolean(id)))];
        const [profilesForBookings, profilesForVendors] = await Promise.all([
          bookingCustomers.length ? supabase.from("profiles").select("id,name,email").in("id", bookingCustomers) : Promise.resolve({ data: [], error: null }),
          vendorOwners.length ? supabase.from("profiles").select("id,name,email").in("id", vendorOwners) : Promise.resolve({ data: [], error: null }),
        ]);
        if (profilesForBookings.error) throw profilesForBookings.error;
        if (profilesForVendors.error) throw profilesForVendors.error;
        const customerMap = new Map((profilesForBookings.data ?? []).map((profile) => [profile.id, profile]));
        const ownerMap = new Map((profilesForVendors.data ?? []).map((profile) => [profile.id, profile]));
        if (!active) return;
        setCounts({
          vendors: vendors.count ?? 0, pendingVendors: pending.count ?? 0, approvedVendors: approved.count ?? 0,
          rejectedVendors: rejected.count ?? 0,
          customers: customers.count ?? 0, bookings: bookings.count ?? 0,
          pendingBookings: pendingBookings.count ?? 0, completedBookings: completed.count ?? 0,
          services: services.count ?? 0,
        });
        setRecentBookings((bookingResult.data ?? []).map((booking) => ({
          ...booking,
          customer: customerMap.get(booking.customer_id) ?? null,
          vendorNames: [],
        })) as AdminBookingRow[]);
        setPendingVendors((vendorResult.data ?? []).map((vendor) => ({
          ...vendor,
          owner: vendor.auth_user_id ? ownerMap.get(vendor.auth_user_id) ?? null : null,
        })) as AdminVendorRow[]);
      } catch (loadError) {
        console.error("Unable to load admin dashboard data", loadError);
        if (active) setError(adminDatabaseErrorMessage(loadError));
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => { active = false; };
  }, []);
  const amount = (value: number | string) => `₹${Number(value).toLocaleString("en-IN")}`;
  return <Workspace role="admin" page={page} go={go}><WorkspaceTop eyebrow="Admin" title="Platform overview" text="A simple view of what’s happening across Jashn."/>
    {error && <p className="form-error" role="alert">{error}</p>}
    {loading ? <p>Loading dashboard…</p> : counts && <>
      {counts.vendors === 0 && <p role="status">No vendor rows were visible to this admin account. If vendors exist, an RLS SELECT policy may be filtering them; Supabase does not return a row-level security error for rows hidden by policy.</p>}
      <div className="stats-grid"><Stat label="Total vendors" value={String(counts.vendors)} note={`${counts.pendingVendors} pending approval`}/><Stat label="Pending vendors" value={String(counts.pendingVendors)} note="Needs review"/><Stat label="Approved vendors" value={String(counts.approvedVendors)} note="Approved or active"/><Stat label="Rejected vendors" value={String(counts.rejectedVendors)} note="Applications rejected"/><Stat label="Total customers" value={String(counts.customers)} note="Customer profiles"/><Stat label="Total bookings" value={String(counts.bookings)} note={`${counts.pendingBookings} pending`}/><Stat label="Pending bookings" value={String(counts.pendingBookings)} note="Awaiting action"/><Stat label="Completed bookings" value={String(counts.completedBookings)} note="Completed"/><Stat label="Active services" value={String(counts.services)} note="Available in marketplace"/></div>
      <div className="table-wrap"><div className="table-title"><Heading level={2}>Recent bookings</Heading><Button variant="text" onClick={() => go("admin-bookings")}>View all</Button></div>
        {recentBookings.length ? <table><thead><tr><th>Booking ID</th><th>Customer</th><th>Event</th><th>Date</th><th>Amount</th><th>Status</th></tr></thead><tbody>{recentBookings.map((booking) => <tr key={booking.id}><td><strong>{booking.id}</strong></td><td>{booking.customer?.name ?? booking.customer?.email ?? "Customer"}</td><td>{booking.event_type}</td><td>{new Date(booking.event_date).toLocaleDateString("en-IN")}</td><td>{amount(booking.total_amount)}</td><td><Badge tone={booking.status === "pending" ? "warning" : booking.status === "completed" ? "success" : "wine"}>{booking.status}</Badge></td></tr>)}</tbody></table> : <div className="empty-state">No bookings yet.</div>}
      </div>
      <div className="table-wrap pending-apps"><div className="table-title"><Heading level={2}>Pending Vendor Applications: {counts.pendingVendors}</Heading><Button variant="text" onClick={() => go("admin-vendors")}>View all</Button></div>{pendingVendors.length ? pendingVendors.map((vendor) => <div key={vendor.id}><strong>{vendor.business_name} · {vendor.city}</strong><span>{vendor.owner?.name ?? vendor.owner?.email ?? "Owner details unavailable"} · {new Date(vendor.created_at).toLocaleDateString("en-IN")}</span><Button variant="secondary" onClick={() => go("admin-vendors")}>Review</Button></div>) : <div className="empty-state">No pending vendor applications.</div>}</div>
    </>}
  </Workspace>;
}

function AdminVendors({ page, go }: { page: Page; go: (page: Page) => void }) {
  const [vendors, setVendors] = useState<AdminVendorRow[]>([]);
  const [vendorCounts, setVendorCounts] = useState({ pending: 0, approved: 0, rejected: 0 });
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All statuses");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const load = async (): Promise<AdminVendorRow[] | null> => {
    if (!supabase) {
      setError("Supabase is not configured.");
      setLoading(false);
      return null;
    }
    setLoading(true);
    try {
      await verifyAdminSession();
      const { data, error: queryError } = await supabase.from("vendors")
        .select("id,auth_user_id,business_name,city,status,created_at")
        .order("created_at", { ascending: false });
      if (queryError) throw queryError;
      const [pendingResult, approvedResult, rejectedResult] = await Promise.all([
        supabase.from("vendors").select("id", { count: "exact", head: true }).eq("status", "pending"),
        supabase.from("vendors").select("id", { count: "exact", head: true }).eq("status", "approved"),
        supabase.from("vendors").select("id", { count: "exact", head: true }).eq("status", "rejected"),
      ]);
      const countError = pendingResult.error ?? approvedResult.error ?? rejectedResult.error;
      if (countError) throw countError;
      const ownerIds = [...new Set((data ?? []).map((vendor) => vendor.auth_user_id).filter((id): id is string => Boolean(id)))];
      const { data: profiles, error: profileError } = ownerIds.length
        ? await supabase.from("profiles").select("id,name,email").in("id", ownerIds)
        : { data: [], error: null };
      if (profileError) throw profileError;
      const ownerMap = new Map((profiles ?? []).map((profile) => [profile.id, profile]));
      const loadedVendors = (data ?? []).map((vendor) => ({
        ...vendor,
        owner: vendor.auth_user_id ? ownerMap.get(vendor.auth_user_id) ?? null : null,
      })) as AdminVendorRow[];
      setVendors(loadedVendors);
      setVendorCounts({
        pending: pendingResult.count ?? 0,
        approved: approvedResult.count ?? 0,
        rejected: rejectedResult.count ?? 0,
      });
      setError(null);
      return loadedVendors;
    } catch (loadError) {
      console.error("Unable to load admin vendors", loadError);
      setError(adminDatabaseErrorMessage(loadError));
      return null;
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);
  const setVendorStatus = async (vendor: AdminVendorRow, status: "approved" | "rejected") => {
    if (!supabase) {
      setError("Supabase is not configured.");
      return;
    }
    setSavingId(vendor.id);
    setError(null);
    try {
      console.log(status === "approved" ? "Approving vendor:" : "Rejecting vendor:", vendor.id);
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;
      console.log("Current admin user:", user?.id);
      if (!user) throw new Error("Your admin session has expired. Please log in again.");
      const { data: profile, error: profileError } = await supabase
        .from("profiles").select("id,role").eq("id", user.id).maybeSingle();
      if (profileError) throw profileError;
      console.log("Current admin profile:", profile);
      if (profile?.role !== "admin") throw new Error("You do not have permission to update vendor status.");

      const { data, error } = await supabase.rpc("admin_set_vendor_status", {
        p_vendor_id: vendor.id,
        p_status: status,
      });
      if (status === "approved") {
        console.log("Approve result:", data);
        console.log("Approve error:", error);
      } else {
        console.log("Reject result:", data);
        console.log("Reject error:", error);
      }
      if (error) throw error;

      const refreshedVendors = await load();
      if (!refreshedVendors) throw new Error("Vendor update was sent, but the vendor list and counts could not be refreshed.");
      const refreshedVendor = refreshedVendors.find((item) => item.id === vendor.id);
      if (refreshedVendor?.status !== status) {
        throw new Error(`The status action returned without an error, but the vendor still reads "${refreshedVendor?.status ?? "not visible"}". Check the deployed admin_set_vendor_status RPC and its database permissions.`);
      }
    } catch (updateError) {
      console.error(`Unable to set vendor status to ${status}`, updateError);
      setError(adminDatabaseErrorMessage(updateError));
    } finally {
      setSavingId(null);
    }
  };
  const shown = vendors.filter((vendor) => {
    const matchesStatus = statusFilter === "All statuses" || vendor.status.toLowerCase() === statusFilter.toLowerCase();
    const term = search.trim().toLowerCase();
    const matchesSearch = !term || [vendor.business_name, vendor.city, vendor.owner?.name, vendor.owner?.email]
      .some((value) => value?.toLowerCase().includes(term));
    return matchesStatus && matchesSearch;
  });
  return <Workspace role="admin" page={page} go={go}><WorkspaceTop eyebrow="Admin · Vendors" title="Vendor management" text="Review applications and manage active partners."/>
    <div className="filter-bar"><Field label="Search vendors" placeholder="Name, owner or city" value={search} onChange={(event) => setSearch(event.target.value)}/><SelectField label="Status" compact value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option>All statuses</option><option>Pending</option><option>Approved</option><option>Active</option><option>Rejected</option><option>Suspended</option></SelectField></div>
    {error && <p className="form-error" role="alert">{error}</p>}
    {!loading && !error && vendors.length === 0 && <p role="status">No vendor rows were visible to this admin account. If vendors exist, verify the admin SELECT policy on public.vendors.</p>}
    <p role="status">Pending: {vendorCounts.pending} · Approved: {vendorCounts.approved} · Rejected: {vendorCounts.rejected}</p>
    <div className="table-wrap"><table><thead><tr><th>Vendor</th><th>Owner</th><th>Owner email</th><th>Location</th><th>Applied</th><th>Status</th><th>Actions</th></tr></thead><tbody>{loading ? <tr><td colSpan={7}>Loading vendors...</td></tr> : shown.length ? shown.map((vendor) => <tr key={vendor.id}><td><strong>{vendor.business_name}</strong></td><td>{vendor.owner?.name ?? "—"}</td><td>{vendor.owner?.email ?? "—"}</td><td>{vendor.city}</td><td>{new Date(vendor.created_at).toLocaleDateString("en-IN")}</td><td><Badge tone={vendor.status === "approved" || vendor.status === "active" ? "success" : vendor.status === "pending" ? "warning" : "danger"}>{vendor.status}</Badge></td><td><div className="table-actions">{vendor.status === "pending" && <><button disabled={savingId === vendor.id} onClick={() => setVendorStatus(vendor, "approved")}>Approve</button><button disabled={savingId === vendor.id} className="danger-text" onClick={() => setVendorStatus(vendor, "rejected")}>Reject</button></>}</div></td></tr>) : <tr><td colSpan={7}>No vendors found.</td></tr>}</tbody></table></div>
  </Workspace>;
}

function AdminBookings({ page, go }: { page: Page; go: (page: Page) => void }) {
  const [bookings, setBookings] = useState<AdminBookingRow[]>([]);
  const [status, setStatus] = useState("All statuses");
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        await verifyAdminSession();
        if (!supabase) return;
        const { data, error: queryError } = await supabase.from("bookings")
          .select("id,customer_id,event_type,event_date,venue,phone,total_amount,status,payment_status,created_at")
          .order("created_at", { ascending: false });
        if (queryError) throw queryError;
        const customerIds = [...new Set((data ?? []).map((booking) => booking.customer_id))];
        const bookingIds = (data ?? []).map((booking) => booking.id);
        const [profileResult, itemsResult] = await Promise.all([
          customerIds.length ? supabase.from("profiles").select("id,name,email").in("id", customerIds) : Promise.resolve({ data: [], error: null }),
          bookingIds.length ? supabase.from("booking_items").select("booking_id,vendor_id").in("booking_id", bookingIds) : Promise.resolve({ data: [], error: null }),
        ]);
        if (profileResult.error) throw profileResult.error;
        if (itemsResult.error) throw itemsResult.error;
        const vendorIds = [...new Set((itemsResult.data ?? []).map((item) => item.vendor_id))];
        const { data: vendorRows, error: vendorError } = vendorIds.length
          ? await supabase.from("vendors").select("id,business_name").in("id", vendorIds)
          : { data: [], error: null };
        if (vendorError) throw vendorError;
        const profileMap = new Map((profileResult.data ?? []).map((profile) => [profile.id, profile]));
        const vendorMap = new Map((vendorRows ?? []).map((vendor) => [vendor.id, vendor.business_name]));
        const vendorNamesByBooking = new Map<string, string[]>();
        for (const item of itemsResult.data ?? []) {
          const name = vendorMap.get(item.vendor_id);
          if (name) vendorNamesByBooking.set(item.booking_id, [...(vendorNamesByBooking.get(item.booking_id) ?? []), name]);
        }
        if (active) setBookings((data ?? []).map((booking) => ({
          ...booking,
          customer: profileMap.get(booking.customer_id) ?? null,
          vendorNames: [...new Set(vendorNamesByBooking.get(booking.id) ?? [])],
        })) as AdminBookingRow[]);
      } catch (loadError) {
        console.error("Unable to load admin bookings", loadError);
        if (active) setError(loadError instanceof Error ? loadError.message : "Unable to load bookings.");
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => { active = false; };
  }, []);
  const shown = bookings.filter((booking) => {
    const matchesStatus = status === "All statuses" || booking.status.toLowerCase() === status.toLowerCase();
    const term = search.trim().toLowerCase();
    const matchesSearch = !term || [booking.id, booking.customer?.name, booking.customer?.email, booking.event_type]
      .some((value) => value?.toLowerCase().includes(term));
    return matchesStatus && matchesSearch;
  });
  const amount = (value: number | string) => `₹${Number(value).toLocaleString("en-IN")}`;
  return <Workspace role="admin" page={page} go={go}><WorkspaceTop eyebrow="Admin · Bookings" title="All bookings" text="Track bookings across customers and vendors."/><div className="filter-bar"><Field label="Search bookings" placeholder="Booking ID or customer" value={search} onChange={(event) => setSearch(event.target.value)}/><SelectField label="Status" compact value={status} onChange={(event) => setStatus(event.target.value)}><option>All statuses</option><option>Pending</option><option>Accepted</option><option>Rejected</option><option>Completed</option></SelectField></div>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="table-wrap"><table><thead><tr><th>Booking ID</th><th>Customer</th><th>Vendor</th><th>Event</th><th>Date</th><th>Venue</th><th>Amount</th><th>Status</th><th>Payment</th><th>Created</th></tr></thead><tbody>{loading ? <tr><td colSpan={10}>Loading bookings…</td></tr> : shown.length ? shown.map((booking) => <tr key={booking.id}><td><strong>{booking.id}</strong></td><td>{booking.customer?.name ?? booking.customer?.email ?? "—"}</td><td>{booking.vendorNames.join(", ") || "—"}</td><td>{booking.event_type}</td><td>{new Date(booking.event_date).toLocaleDateString("en-IN")}</td><td>{booking.venue}</td><td>{amount(booking.total_amount)}</td><td><Badge tone={booking.status === "pending" ? "warning" : booking.status === "completed" ? "success" : "wine"}>{booking.status}</Badge></td><td>{booking.payment_status}</td><td>{new Date(booking.created_at).toLocaleDateString("en-IN")}</td></tr>) : <tr><td colSpan={10}>No bookings found.</td></tr>}</tbody></table></div>
  </Workspace>;
}

function AdminUsers({ page, go }: { page: Page; go: (page: Page) => void }) {
  const [profiles, setProfiles] = useState<CustomerProfile[]>([]);
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("All roles");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        await verifyAdminSession();
        if (!supabase) return;
        const { data, error: queryError } = await supabase.from("profiles")
          .select("id,name,email,phone,role,created_at").order("created_at", { ascending: false });
        if (queryError) throw queryError;
        if (active) setProfiles((data ?? []) as CustomerProfile[]);
      } catch (loadError) {
        console.error("Unable to load admin user profiles", loadError);
        if (active) setError(loadError instanceof Error ? loadError.message : "Unable to load users.");
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => { active = false; };
  }, []);
  const shown = profiles.filter((profile) => {
    const term = search.trim().toLowerCase();
    const matchesSearch = !term || [profile.name, profile.email, profile.phone].some((value) => value?.toLowerCase().includes(term));
    return matchesSearch && (role === "All roles" || profile.role === role.toLowerCase());
  });
  return <Workspace role="admin" page={page} go={go}><WorkspaceTop eyebrow="Admin · Users" title="Customer accounts" text="View marketplace profiles and account roles."/><div className="filter-bar"><Field label="Search users" placeholder="Name, email or phone" value={search} onChange={(event) => setSearch(event.target.value)}/><SelectField label="Role" compact value={role} onChange={(event) => setRole(event.target.value)}><option>All roles</option><option>Customer</option><option>Vendor</option><option>Admin</option></SelectField></div>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="table-wrap"><table><thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Role</th><th>Created</th></tr></thead><tbody>{loading ? <tr><td colSpan={5}>Loading users…</td></tr> : shown.length ? shown.map((profile) => <tr key={profile.id}><td><strong>{profile.name}</strong></td><td>{profile.email}</td><td>{profile.phone || "—"}</td><td><Badge tone={profile.role === "admin" ? "wine" : profile.role === "vendor" ? "warning" : "success"}>{profile.role ?? "unknown"}</Badge></td><td>{profile.created_at ? new Date(profile.created_at).toLocaleDateString("en-IN") : "—"}</td></tr>) : <tr><td colSpan={5}>No users found.</td></tr>}</tbody></table></div>
  </Workspace>;
}

function AdminServices({ page, go }: { page: Page; go: (page: Page) => void }) {
  const [services, setServices] = useState<AdminServiceRow[]>([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        await verifyAdminSession();
        if (!supabase) return;
        const { data, error: queryError } = await supabase.from("services")
          .select("id,name,vendor_id,category,price,event_types,status")
          .order("created_at", { ascending: false });
        if (queryError) throw queryError;
        const vendorIds = [...new Set((data ?? []).map((item) => item.vendor_id))];
        const { data: vendorRows, error: vendorError } = vendorIds.length
          ? await supabase.from("vendors").select("id,business_name").in("id", vendorIds)
          : { data: [], error: null };
        if (vendorError) throw vendorError;
        const vendorMap = new Map((vendorRows ?? []).map((vendor) => [vendor.id, vendor.business_name]));
        if (active) setServices((data ?? []).map((item) => ({
          ...item,
          vendor_name: vendorMap.get(item.vendor_id) ?? "Vendor unavailable",
        })) as AdminServiceRow[]);
      } catch (loadError) {
        console.error("Unable to load admin services", loadError);
        if (active) setError(loadError instanceof Error ? loadError.message : "Unable to load services.");
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => { active = false; };
  }, []);
  const shown = services.filter((item) => [item.name, item.vendor_name, item.category, item.status]
    .some((value) => value?.toLowerCase().includes(search.trim().toLowerCase())));
  return <Workspace role="admin" page={page} go={go}><WorkspaceTop eyebrow="Admin · Services" title="Marketplace services" text="View services currently listed across the marketplace."/><div className="filter-bar"><Field label="Search services" placeholder="Service, vendor or category" value={search} onChange={(event) => setSearch(event.target.value)}/></div>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="table-wrap"><table><thead><tr><th>Service</th><th>Vendor</th><th>Category</th><th>Price</th><th>Event types</th><th>Status</th></tr></thead><tbody>{loading ? <tr><td colSpan={6}>Loading services…</td></tr> : shown.length ? shown.map((item) => <tr key={item.id}><td><strong>{item.name}</strong></td><td>{item.vendor_name}</td><td>{item.category ?? "—"}</td><td>₹{Number(item.price).toLocaleString("en-IN")}</td><td>{normalizeEventTypes(item.event_types).join(", ") || "—"}</td><td><Badge tone={item.status === "active" ? "success" : "neutral"}>{item.status}</Badge></td></tr>) : <tr><td colSpan={6}>No services found.</td></tr>}</tbody></table></div>
  </Workspace>;
}

export default function App() {
  const [page, setPage] = useState<Page>(readPageFromLocation);
  const [customer, setCustomer] = useState<CustomerProfile | null>(null);
  const [customerLoading, setCustomerLoading] = useState(true);
  const [customerLoadError, setCustomerLoadError] = useState<string | null>(null);
  const authRevision = useRef(0);
  const activeAuthUserId = useRef<string | null>(null);
  const loadedProfileId = useRef<string | null>(null);
  const profileRequests = useRef(new Map<string, Promise<CustomerProfile | null>>());
  const [cartItems, setCartItems] = useState<CartItem[]>(readCartFromStorage);
  const [checkoutAfterLogin, setCheckoutAfterLogin] = useState(false);
  const [cartNotice, setCartNotice] = useState<string | null>(null);
  const [bookingError, setBookingError] = useState<string | null>(null);
  const [selectedService, setSelectedService] = useState<ServiceItem | null>(null);
  const [selectedServiceId, setSelectedServiceId] = useState<string | null>(
    () => new URLSearchParams(window.location.search).get("id"),
  );
  const [activeBookingId, setActiveBookingId] = useState<string | null>(
    () => new URLSearchParams(window.location.search).get("booking"),
  );
  const [activeBooking, setActiveBooking] = useState<BookingRecord | null>(null);
  const [bookingLoading, setBookingLoading] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState(() =>
    formatEventLabel(new URLSearchParams(window.location.search).get("event") ?? "Birthday"),
  );
  const [selectedCategory, setSelectedCategory] = useState(() =>
    formatCategoryLabel(new URLSearchParams(window.location.search).get("category")),
  );
  const [authNotice, setAuthNotice] = useState<string | null>(null);
  const [bookingSubmitting, setBookingSubmitting] = useState(false);
  const [vendorRecord, setVendorRecord] = useState<VendorRecord | null>(null);

  useEffect(() => {
    localStorage.setItem("jashn-cart", JSON.stringify(cartItems));
  }, [cartItems]);

  useEffect(() => {
    if (customerLoading || customer || !["checkout", "bookings", "profile"].includes(page)) return;
    if (page === "checkout") setCheckoutAfterLogin(true);
    setAuthNotice("Please login or register before booking an event.");
    setPage("login");
    window.history.replaceState({}, "", window.location.pathname);
  }, [customerLoading, customer, page]);

  useEffect(() => {
    if (customerLoading || !customer || !["checkout", "bookings", "profile"].includes(page)) return;
    if (customer.role === "admin") {
      setPage("admin-dashboard");
      window.history.replaceState({}, "", `${window.location.pathname}?page=admin-dashboard`);
    } else if (customer.role === "vendor") {
      const nextPage = vendorRecord && ["approved", "active"].includes(vendorRecord.status.toLowerCase())
        ? "vendor-dashboard"
        : "vendor-pending";
      setPage(nextPage);
      window.history.replaceState({}, "", `${window.location.pathname}?page=${nextPage}`);
    }
  }, [customerLoading, customer, page, vendorRecord]);

  useEffect(() => {
    const handlePopState = () => {
      setPage(readPageFromLocation());
      const params = new URLSearchParams(window.location.search);
      setSelectedServiceId(params.get("id"));
      setActiveBookingId(params.get("booking"));
      setSelectedEvent(formatEventLabel(params.get("event") ?? "Birthday"));
      setSelectedCategory(formatCategoryLabel(params.get("category")));
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const fetchCustomerProfile = (userId: string) => {
    if (!supabase) return Promise.reject(new Error("Supabase is not configured."));

    const existingRequest = profileRequests.current.get(userId);
    if (existingRequest) return existingRequest;

    const request = withTimeout(
      supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
      "Loading your account profile timed out. Please retry.",
    ).then(({ data, error }) => {
      if (error) throw new Error(`Unable to load your account profile: ${error.message}`);
      return data as CustomerProfile | null;
    });
    profileRequests.current.set(userId, request);
    request.then(
      () => {
        if (profileRequests.current.get(userId) === request) profileRequests.current.delete(userId);
      },
      () => {
        if (profileRequests.current.get(userId) === request) profileRequests.current.delete(userId);
      },
    );
    return request;
  };

  const trackAuthUser = (userId: string | null) => {
    if (activeAuthUserId.current !== userId) {
      activeAuthUserId.current = userId;
      authRevision.current += 1;
    }
    return authRevision.current;
  };

  const applySession = async (session: { user: { id: string } } | null, revision: number) => {
    if (revision !== authRevision.current) return;
    const userId = session?.user.id;
    if (!userId) {
      loadedProfileId.current = null;
      setCustomer(null);
      setCustomerLoadError(null);
      setCustomerLoading(false);
      return;
    }

    if (loadedProfileId.current === userId) {
      setCustomerLoadError(null);
      setCustomerLoading(false);
      return;
    }

    if (loadedProfileId.current !== userId) {
      loadedProfileId.current = null;
      setCustomer(null);
      setVendorRecord(null);
    }
    setCustomerLoading(true);
    setCustomerLoadError(null);
    try {
      const profile = await fetchCustomerProfile(userId);
      if (revision !== authRevision.current) return;
      if (!profile) {
        setCustomer(null);
        setCustomerLoadError("Your account is signed in, but its profile could not be found. Please retry or contact support.");
        return;
      }
      loadedProfileId.current = userId;
      setCustomer(profile);
    } catch (error) {
      if (revision !== authRevision.current) return;
      console.error("Unable to load authenticated account profile", error);
      setCustomer(null);
      setCustomerLoadError(error instanceof Error ? error.message : "Unable to load your account. Please retry.");
    } finally {
      if (revision === authRevision.current) setCustomerLoading(false);
    }
  };

  const retryCustomerProfile = async () => {
    const client = supabase;
    const revision = ++authRevision.current;
    activeAuthUserId.current = null;
    setCustomerLoading(true);
    setCustomerLoadError(null);
    if (!client) {
      setCustomerLoading(false);
      setCustomerLoadError("Supabase is not configured. Please contact support.");
      return;
    }

    try {
      const { data, error } = await withTimeout(
        client.auth.getSession(),
        "Checking your session timed out. Please retry.",
      );
      if (error) throw error;
      const currentRevision = trackAuthUser(data.session?.user.id ?? null);
      await applySession(data.session, currentRevision);
    } catch (error) {
      if (revision !== authRevision.current) return;
      console.error("Unable to retry account loading", error);
      setCustomer(null);
      setCustomerLoadError(error instanceof Error ? error.message : "Unable to check your session. Please retry.");
      setCustomerLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    const client = supabase;
    if (!client) {
      setCustomerLoading(false);
      setCustomerLoadError("Supabase is not configured. Please contact support.");
      return;
    }

    const { data: authListener } = client.auth.onAuthStateChange((event, session) => {
      if (event === "TOKEN_REFRESHED") return;
      const revision = trackAuthUser(session?.user.id ?? null);
      if (!session?.user) {
        loadedProfileId.current = null;
        setCustomer(null);
        setVendorRecord(null);
        setCustomerLoadError(null);
        setCustomerLoading(false);
        return;
      }

      queueMicrotask(() => {
        if (active) void applySession(session, revision);
      });
    });

    const revision = authRevision.current;
    const initializeSession = async () => {
      try {
        const { data, error } = await withTimeout(
          client.auth.getSession(),
          "Checking your session timed out. Please retry.",
        );
        if (error) throw error;
        if (active) {
          const currentRevision = trackAuthUser(data.session?.user.id ?? null);
          await applySession(data.session, currentRevision);
        }
      } catch (error) {
        if (!active || revision !== authRevision.current) return;
        console.error("Unable to restore Supabase session", error);
        setCustomer(null);
        setCustomerLoadError(error instanceof Error ? error.message : "Unable to check your session. Please retry.");
        setCustomerLoading(false);
      }
    };

    void initializeSession();
    return () => {
      active = false;
      authRevision.current += 1;
      authListener.subscription.unsubscribe();
    };
  }, []);

  const go = (target: Page) => {
    const protectedPages = new Set(["bookings", "checkout", "profile"]);
    if (protectedPages.has(target) && !customer?.id) {
      if (target === "checkout") setCheckoutAfterLogin(true);
      setAuthNotice("Please login or register before booking an event.");
      setPage("login");
      window.history.replaceState({}, "", window.location.pathname);
      return;
    }

    setPage(target);
    if (target === "explore") {
      updateLocation(target, { event: selectedEvent, category: selectedCategory });
    } else if (target === "service") {
      updateLocation(target, { id: selectedServiceId, event: selectedEvent, category: selectedCategory });
    } else if (target === "confirmation" && activeBookingId) {
      updateLocation(target, { booking: activeBookingId });
    } else {
      window.history.replaceState({}, "", window.location.pathname);
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleSelectService = useCallback((service: ServiceItem) => {
    setSelectedService(service);
  }, []);

  const handleOpenService = (serviceId: string) => {
    setSelectedServiceId(serviceId);
    updateLocation("service", { id: serviceId, event: selectedEvent });
    setPage("service");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleEventChange = (eventType: string) => {
    const normalizedEvent = formatEventLabel(eventType);
    setSelectedEvent(normalizedEvent);
    const params = new URLSearchParams({
      page: "explore",
      event: normalizedEvent,
      category: selectedCategory,
    });
    window.history.replaceState({}, "", `${window.location.pathname}?${params.toString()}`);
  };

  const handleCategoryChange = (category: string) => {
    const normalizedCategory = formatCategoryLabel(category);
    setSelectedCategory(normalizedCategory);
    const params = new URLSearchParams({
      page: "explore",
      event: selectedEvent,
      category: normalizedCategory,
    });
    window.history.replaceState({}, "", `${window.location.pathname}?${params.toString()}`);
  };

  const handleLoadedService = useCallback((service: ServiceItem) => {
    setSelectedService(service);
  }, []);

  const handleAddToCart = (service: ServiceItem) => {
    if (!service.id || !service.vendorId || typeof service.priceAmount !== "number" || !Number.isFinite(service.priceAmount)) {
      setCartNotice("This service is missing required booking details. Please try another service.");
      go("cart");
      return;
    }
    const serviceId = service.id;
    const vendorId = service.vendorId;
    const price = service.priceAmount;

    setCartNotice(null);
    setCartItems((currentItems) => {
      const existing = currentItems.find((item) => item.service_id === serviceId);
      if (existing) {
        return currentItems.map((item) => item.service_id === serviceId
          ? { ...item, quantity: item.quantity + 1 }
          : item);
      }
      return [...currentItems, {
        service_id: serviceId,
        vendor_id: vendorId,
        name: service.name,
        price,
        image: service.image ?? null,
        quantity: 1,
        event_type: service.eventType,
        category: service.category,
        vendor_name: service.vendor,
        city: service.city,
      }];
    });
    go("cart");
  };

  const handleCartQuantityChange = (serviceId: string, quantity: number) => {
    setCartItems((currentItems) => currentItems.map((item) =>
      item.service_id === serviceId ? { ...item, quantity } : item));
  };

  const handleCartRemove = (serviceId: string) => {
    setCartItems((currentItems) => currentItems.filter((item) => item.service_id !== serviceId));
  };

  const handleBookNow = (service: ServiceItem) => {
    setSelectedService(service);
    if (service.id) setSelectedServiceId(service.id);
    if (service.id && service.vendorId && typeof service.priceAmount === "number" && Number.isFinite(service.priceAmount)) {
      const cartItem: CartItem = {
        service_id: service.id,
        vendor_id: service.vendorId,
        name: service.name,
        price: service.priceAmount,
        image: service.image ?? null,
        quantity: 1,
        event_type: service.eventType,
        category: service.category,
        vendor_name: service.vendor,
        city: service.city,
      };
      setCartItems((items) => {
        const alreadyAdded = items.some((item) => item.service_id === service.id);
        return alreadyAdded
          ? items.map((item) => item.service_id === service.id ? { ...item, quantity: 1 } : item)
          : [...items, cartItem];
      });
    }
    if (!customer?.id) {
      setCheckoutAfterLogin(true);
      setAuthNotice("Please login or register before booking an event.");
      setPage("login");
      window.history.replaceState({}, "", window.location.pathname);
      return;
    }

    setPage("checkout");
    window.history.replaceState({}, "", window.location.pathname);
  };

  const handleLogin = async (email: string, password: string) => {
    if (!supabase) {
      throw new Error("Supabase is not configured.");
    }

    const { data: signInData, error: signInError } = await withTimeout(
      supabase.auth.signInWithPassword({ email, password }),
      "Logging in timed out. Please try again.",
    );
    if (signInError) {
      const normalized = signInError.message.toLowerCase();
      if (normalized.includes("email not confirmed")) {
        throw new Error("Please confirm your email before logging in.");
      }
      if (normalized.includes("invalid login") || normalized.includes("user not found")) {
        throw new Error("Invalid email or password.");
      }
      throw new Error(`Unable to log in: ${signInError.message}`);
    }

    const user = signInData.user;
    if (!user) {
      throw new Error("Account not found. Kindly register first.");
    }

    const revision = trackAuthUser(user.id);
    const profileData = await fetchCustomerProfile(user.id);
    if (revision !== authRevision.current) throw new Error("Your session changed while logging in. Please try again.");
    if (!profileData) {
      throw new Error("Your account profile could not be found.");
    }

    if (profileData.role === "admin") {
      loadedProfileId.current = user.id;
      setCustomer(profileData);
      setCustomerLoadError(null);
      setAuthNotice(null);
      setPage("admin-dashboard");
      window.history.replaceState({}, "", `${window.location.pathname}?page=admin-dashboard`);
      return;
    }
    if (profileData.role === "vendor") {
      const { data: vendor, error: vendorError } = await withTimeout(
        supabase.from("vendors")
          .select("id,auth_user_id,business_name,city,status")
          .eq("auth_user_id", user.id).maybeSingle(),
        "Loading your vendor application timed out. Please try again.",
      );
      if (revision !== authRevision.current) throw new Error("Your session changed while logging in. Please try again.");
      if (vendorError) {
        console.error("Unable to load vendor application after customer login", vendorError);
        throw new Error(`Unable to load your vendor application: ${vendorError.message}`);
      }
      if (!vendor) throw new Error("No vendor application is linked to this account.");
      setVendorRecord(vendor as VendorRecord);
      loadedProfileId.current = user.id;
      setCustomer(profileData);
      setCustomerLoadError(null);
      setAuthNotice(null);
      const vendorStatus = String(vendor.status).toLowerCase();
      setPage(["approved", "active"].includes(vendorStatus) ? "vendor-dashboard" : "vendor-pending");
      window.history.replaceState({}, "", `${window.location.pathname}?page=${["approved", "active"].includes(vendorStatus) ? "vendor-dashboard" : "vendor-pending"}`);
      return;
    }
    if (profileData.role !== "customer") {
      throw new Error("This account does not have a supported role.");
    }

    loadedProfileId.current = user.id;
    setCustomer(profileData);
    setCustomerLoadError(null);
    setAuthNotice(null);
    setPage(checkoutAfterLogin ? "checkout" : "bookings");
    if (checkoutAfterLogin) {
      setCheckoutAfterLogin(false);
      window.history.replaceState({}, "", window.location.pathname);
    }
  };

  const handleAdminLogin = async (email: string, password: string) => {
    if (!supabase) throw new Error("Supabase is not configured.");
    const { data: signInData, error: signInError } = await withTimeout(
      supabase.auth.signInWithPassword({ email, password }),
      "Logging in timed out. Please try again.",
    );
    if (signInError) {
      console.error("Supabase admin login failed", signInError);
      throw new Error(signInError.message || "Unable to log in.");
    }
    const user = signInData.user;
    if (!user) throw new Error("No authenticated user was returned.");

    const revision = trackAuthUser(user.id);
    const profile = await fetchCustomerProfile(user.id);
    if (revision !== authRevision.current) throw new Error("Your session changed while logging in. Please try again.");
    if (!profile || profile.role !== "admin") {
      const { error: signOutError } = await withTimeout(
        supabase.auth.signOut(),
        "Signing out this account timed out. Please try again.",
      );
      if (signOutError) console.error("Unable to sign out account without admin access", signOutError);
      throw new Error("This account does not have admin access.");
    }
    loadedProfileId.current = user.id;
    setCustomer(profile);
    setCustomerLoadError(null);
    setAuthNotice(null);
    setPage("admin-dashboard");
    window.history.replaceState({}, "", `${window.location.pathname}?page=admin-dashboard`);
  };

  const handleSignup = async (name: string, email: string, phone: string, password: string) => {
    if (!supabase) {
      throw new Error("Supabase is not configured.");
    }

    const { data, error } = await withTimeout(supabase.auth.signUp({
      email,
      password,
      options: {
        data: { name, phone },
      },
    }), "Account creation timed out. Please try again.");

    if (error) {
      console.error("Supabase signup failed", error);
      throw new Error(error.message || "Unable to create your account.");
    }

    if (!data.user) {
      console.error("Supabase signup returned no auth user", data);
      throw new Error("Unable to create your account. Please try again.");
    }

    if (!data.session) {
      setAuthNotice("Your account was created. Please check your email to confirm your address, then log in.");
      setPage("login");
      window.history.replaceState({}, "", window.location.pathname);
      return;
    }

    setAuthNotice(null);
    setPage("home");
  };

  const handleVendorRegister = async (details: { businessName: string; ownerName: string; phone: string; category: string; city: string; email: string; password: string }) => {
    if (!supabase) throw new Error("Supabase is not configured.");
    if (!details.businessName || !details.ownerName || !details.phone || !details.city || !details.email || !details.password) {
      throw new Error("Please complete all required business and account fields.");
    }
    const { data, error } = await withTimeout(supabase.auth.signUp({
      email: details.email,
      password: details.password,
      options: {
        data: {
          role: "vendor",
          name: details.ownerName,
          phone: details.phone,
          business_name: details.businessName,
          city: details.city,
          category: details.category,
        },
      },
    }), "Vendor account creation timed out. Please try again.");
    if (error) {
      console.error("Supabase vendor signup failed", error);
      throw new Error(error.message || "Unable to create vendor account.");
    }
    if (!data.user) throw new Error("Vendor signup returned no authenticated user.");

    if (!data.session) {
      setAuthNotice("Your vendor account was created. Please confirm your email, then log in to access your pending application.");
      setPage("vendor-login");
      window.history.replaceState({}, "", `${window.location.pathname}?page=vendor-login`);
      return;
    }

    const { data: createdVendor, error: vendorError } = await withTimeout(
      supabase.from("vendors")
        .select("id,auth_user_id,business_name,city,status")
        .eq("auth_user_id", data.user.id)
        .maybeSingle(),
      "Your account was created, but loading the vendor application timed out. Please log in and retry.",
    );
    if (vendorError) {
      console.error("Unable to load pending vendor application", vendorError);
      throw new Error(`Your account was created, but the vendor application could not be loaded: ${vendorError.message}`);
    }
    if (!createdVendor) {
      throw new Error("Your account was created, but its pending vendor application was not found. Please contact support.");
    }
    setVendorRecord(createdVendor as VendorRecord);
    setAuthNotice(null);
    setPage("vendor-pending");
    window.history.replaceState({}, "", `${window.location.pathname}?page=vendor-pending`);
  };

  const handleVendorLogin = async (email: string, password: string) => {
    if (!supabase) throw new Error("Supabase is not configured.");
    const { data: signInData, error: signInError } = await withTimeout(
      supabase.auth.signInWithPassword({ email, password }),
      "Logging in timed out. Please try again.",
    );
    if (signInError) {
      console.error("Supabase vendor login failed", signInError);
      throw new Error(signInError.message || "Unable to log in.");
    }
    const user = signInData.user;
    if (!user) throw new Error("No authenticated user was returned.");

    const revision = trackAuthUser(user.id);
    const profile = await fetchCustomerProfile(user.id);
    if (revision !== authRevision.current) throw new Error("Your session changed while logging in. Please try again.");
    const { data: vendor, error: vendorError } = await withTimeout(
      supabase.from("vendors")
        .select("id,auth_user_id,business_name,city,status").eq("auth_user_id", user.id).maybeSingle(),
      "Loading your vendor application timed out. Please try again.",
    );
    if (revision !== authRevision.current) throw new Error("Your session changed while logging in. Please try again.");
    if (vendorError) {
      console.error("Unable to load vendor application", vendorError);
      throw new Error(`Unable to load your vendor application: ${vendorError.message}`);
    }
    if (!profile || profile.role !== "vendor") {
      const { error: signOutError } = await withTimeout(
        supabase.auth.signOut(),
        "Signing out this account timed out. Please try again.",
      );
      if (signOutError) console.error("Unable to sign out account without vendor access", signOutError);
      throw new Error("This account is not registered as a vendor.");
    }
    if (!vendor) {
      const { error: signOutError } = await withTimeout(
        supabase.auth.signOut(),
        "Signing out this account timed out. Please try again.",
      );
      if (signOutError) console.error("Unable to sign out account without vendor access", signOutError);
      throw new Error("This account is not registered as a vendor.");
    }
    setVendorRecord(vendor as VendorRecord);
    loadedProfileId.current = user.id;
    setCustomer(profile);
    setCustomerLoadError(null);
    const normalizedStatus = String(vendor.status).toLowerCase();
    if (["approved", "active"].includes(normalizedStatus)) {
      setPage("vendor-dashboard");
      window.history.replaceState({}, "", `${window.location.pathname}?page=vendor-dashboard`);
    } else {
      setPage("vendor-pending");
      window.history.replaceState({}, "", `${window.location.pathname}?page=vendor-pending`);
    }
  };

  const handleLogout = async () => {
    const revision = ++authRevision.current;
    activeAuthUserId.current = null;
    try {
      if (supabase) {
        const { error } = await withTimeout(
          supabase.auth.signOut(),
          "Logging out timed out. Please try again.",
        );
        if (error) throw error;
      }
      if (revision !== authRevision.current) return;
      loadedProfileId.current = null;
      setCustomer(null);
      setVendorRecord(null);
      setAuthNotice(null);
      setCustomerLoadError(null);
      setPage("home");
    } catch (error) {
      if (revision === authRevision.current) {
        console.error("Unable to log out", error);
        setAuthNotice(error instanceof Error ? error.message : "Unable to log out. Please try again.");
      }
    } finally {
      if (revision === authRevision.current) setCustomerLoading(false);
    }
  };

  const handleBookingConfirm = async (payload: {
    eventType: string;
    eventDate: string;
    venue: string;
    phone: string;
  }) => {
    if (!supabase) {
      setBookingError("Supabase is not configured.");
      return;
    }

    setBookingError(null);
    setBookingSubmitting(true);
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        if (userError) console.error("Unable to verify authenticated user before booking", userError);
        setCheckoutAfterLogin(true);
        setAuthNotice("Kindly login or register before booking.");
        setPage("login");
        window.history.replaceState({}, "", window.location.pathname);
        return;
      }

      if (cartItems.length === 0) {
        setBookingError("Your cart is empty. Add a service before placing your booking.");
        return;
      }

      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("id")
        .eq("id", user.id)
        .maybeSingle();

      if (profileError) {
        console.error("Unable to verify the customer profile before booking", profileError);
        setBookingError("Unable to verify your customer profile. Please sign in again.");
        return;
      }
      if (!profileData) {
        setBookingError("Kindly register before placing an order.");
        return;
      }

      const serviceIds = cartItems.map((item) => item.service_id);
      const liveServices = await fetchActiveServices(undefined, undefined, undefined, serviceIds);
      const servicesById = new Map(liveServices.flatMap((service) =>
        service.id ? [[service.id, service] as const] : []));
      if (liveServices.length !== new Set(serviceIds).size) {
        setBookingError("One or more services are no longer available. Remove unavailable services from your cart and try again.");
        return;
      }

      const verifiedItems = cartItems.map((item) => {
        const service = servicesById.get(item.service_id);
        if (!service?.id || !service.vendorId || typeof service.priceAmount !== "number" || !Number.isFinite(service.priceAmount)) {
          throw new Error("One or more services are no longer available. Remove unavailable services from your cart and try again.");
        }
        return {
          bookingItem: {
            service_id: service.id,
            vendor_id: service.vendorId,
            quantity: item.quantity,
            price: service.priceAmount,
          },
          subtotal: service.priceAmount * item.quantity,
        };
      });
      const verifiedTotal = verifiedItems.reduce((sum, item) => sum + item.subtotal, 0);

      const { data: bookingData, error: bookingInsertError } = await supabase
        .from("bookings")
        .insert({
          customer_id: user.id,
          event_type: payload.eventType,
          event_date: `${payload.eventDate}T00:00:00`,
          venue: payload.venue,
          phone: payload.phone,
          total_amount: verifiedTotal,
          status: "pending",
          payment_status: "pending",
        })
        .select("id, customer_id, event_type, event_date, venue, phone, total_amount, status, payment_status, created_at")
        .single();

      if (bookingInsertError || !bookingData) {
        console.error("Supabase booking insert failed", bookingInsertError);
        setBookingError("We could not create your booking. Please check your details and try again.");
        return;
      }

      const bookingItems: BookingItemInsert[] = verifiedItems.map(({ bookingItem }) => ({
        booking_id: bookingData.id,
        ...bookingItem,
      }));
      const { error: itemInsertError } = await supabase
        .from("booking_items")
        .insert(bookingItems);

      if (itemInsertError) {
        console.error("Supabase booking items insert failed; booking row may exist without items", {
          bookingId: bookingData.id,
          error: itemInsertError,
        });
        setBookingError("Your booking record was created, but its items could not be saved. Your cart has been kept. Please contact support before retrying to avoid a duplicate booking.");
        return;
      }

      setActiveBooking(bookingData as BookingRecord);
      setActiveBookingId(bookingData.id);
      setCartItems([]);
      setPage("confirmation");
      updateLocation("confirmation", { booking: bookingData.id });
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (bookingException) {
      console.error("Booking submission failed", bookingException);
      setBookingError(bookingException instanceof Error
        ? bookingException.message
        : "We could not create your booking. Please try again.");
    } finally {
      setBookingSubmitting(false);
    }
  };

  const handleSelectBooking = (booking: BookingRecord) => {
    setActiveBooking(booking);
    setActiveBookingId(booking.id);
    setPage("confirmation");
    updateLocation("confirmation", { booking: booking.id });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  useEffect(() => {
    const client = supabase;
    if (page !== "confirmation" || !activeBookingId || !client) return;

    let active = true;
    const loadBooking = async () => {
      setBookingLoading(true);
      try {
        const { data: { user }, error: userError } = await client.auth.getUser();
        if (userError || !user) {
          if (userError) console.error("Unable to authenticate before loading booking", userError);
          throw new Error("Please log in to view this booking.");
        }

        const { data, error } = await client
          .from("bookings")
          .select("id, customer_id, event_type, event_date, venue, phone, total_amount, status, payment_status, created_at")
          .eq("id", activeBookingId)
          .eq("customer_id", user.id)
          .maybeSingle();
        if (error) {
          console.error("Supabase booking detail query failed", error);
          throw error;
        }
        if (active) setActiveBooking(data as BookingRecord | null);
      } catch (error) {
        console.error("Unable to load booking details", error);
        if (active) setActiveBooking(null);
      } finally {
        if (active) setBookingLoading(false);
      }
    };

    loadBooking();
    return () => {
      active = false;
    };
  }, [page, activeBookingId, customer?.id]);

  const vendorPage = page.startsWith("vendor-") && !["vendor-login", "vendor-register", "vendor-pending"].includes(page);
  const adminPage = page.startsWith("admin-") && page !== "admin-login";

  if (page === "vendor-login") return <RoleAuth role="vendor" mode="login" go={go} authMessage={authNotice} onVendorLogin={handleVendorLogin}/>;
  if (page === "vendor-register") return <RoleAuth role="vendor" mode="register" go={go} onVendorRegister={handleVendorRegister}/>;
  if (page === "vendor-pending") return <VendorPending go={go} vendor={vendorRecord} status={vendorRecord?.status ?? "pending"} message={vendorRecord ? undefined : "Log in with your vendor account to check its application status."}/>;
  if (page === "admin-login") return <RoleAuth role="admin" mode="login" go={go} onAdminLogin={handleAdminLogin}/>;
  if (vendorPage) {
    return <VendorAccessGate page={page} go={go}>{(access) => {
      if (page === "vendor-dashboard") return <VendorDashboard page={page} go={go} vendor={access.vendor} profile={access.profile}/>;
      if (page === "vendor-bookings") return <VendorBookings page={page} go={go} vendor={access.vendor}/>;
      if (page === "vendor-services") return <VendorServices page={page} go={go} vendor={access.vendor}/>;
      if (page === "vendor-portfolio") return <VendorPortfolio page={page} go={go} vendor={access.vendor}/>;
      return <VendorEditProfile page={page} go={go} vendor={access.vendor} profile={access.profile}/>;
    }}</VendorAccessGate>;
  }
  if (adminPage) {
    return <AdminAccessGate page={page} go={go}>{() => {
      if (page === "admin-vendors") return <AdminVendors page={page} go={go}/>;
      if (page === "admin-users") return <AdminUsers page={page} go={go}/>;
      if (page === "admin-bookings") return <AdminBookings page={page} go={go}/>;
      if (page === "admin-services") return <AdminServices page={page} go={go}/>;
      return <AdminDashboard page={page} go={go}/>;
    }}</AdminAccessGate>;
  }
  if (page === "login" || page === "signup") return <Auth mode={page} go={go} authMessage={authNotice} onLogin={handleLogin} onSignup={handleSignup}/>;

  const pages: Record<string, ReactNode> = {
    home: <Home go={go} onSelectService={handleSelectService}/>,
    explore: <Explore
      go={go}
      selectedEvent={selectedEvent}
      selectedCategory={selectedCategory}
      onEventChange={handleEventChange}
      onCategoryChange={handleCategoryChange}
      onSelectService={handleSelectService}
      onOpenService={handleOpenService}
    />,
    service: <ServiceDetails
      go={go}
      serviceId={selectedServiceId}
      onLoadService={handleLoadedService}
      onBookNow={handleBookNow}
      onAddToCart={handleAddToCart}
    />,
    vendor: <VendorProfile go={go}/>,
    packages: <Packages go={go} onSelectService={handleSelectService}/>,
    cart: <Cart
      go={go}
      items={cartItems}
      notice={cartNotice}
      onQuantityChange={handleCartQuantityChange}
      onRemove={handleCartRemove}
    />,
    checkout: <Checkout
      go={go}
      cartItems={cartItems}
      customer={customer}
      onConfirmBooking={handleBookingConfirm}
      submitting={bookingSubmitting}
      bookingError={bookingError}
    />,
    confirmation: <Confirmation go={go} booking={activeBooking} loading={bookingLoading}/>,
    bookings: <MyBookings go={go} customer={customer} onSelectBooking={handleSelectBooking}/>,
    profile: <CustomerProfile go={go} customer={customer} onLogout={handleLogout}/>,
  };

  const customerOnlyPage = ["checkout", "bookings", "profile"].includes(page);
  const roleRedirecting = customerOnlyPage && (customer?.role === "admin" || customer?.role === "vendor");
  return <><Header go={go} page={page} customerName={customer?.name ? customer.name.split(" ")[0] : null} role={customer?.role} onLogout={handleLogout} cartCount={cartItems.reduce((sum, item) => sum + item.quantity, 0)}/>{customerLoading || roleRedirecting ? <div className="shell empty-state"><Heading level={2}>{roleRedirecting ? "Opening your workspace…" : "Loading your account…"}</Heading></div> : customerLoadError ? <div className="shell empty-state"><Heading level={2}>We couldn’t load your account</Heading><p className="form-error" role="alert">{customerLoadError}</p><Button onClick={retryCustomerProfile}>Retry</Button></div> : (pages[page] || pages.home)}<Footer go={go}/></>;
}
