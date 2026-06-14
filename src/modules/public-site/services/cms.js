import Database from '@/lib/db/index';
import { cleanText, ensureSalonSchema } from '@/lib/salon-schema';
import { galleryItems } from '@/modules/public-site/data/gallery';
import { publicPackages } from '@/modules/public-site/data/packages';
import { salonInfo } from '@/modules/public-site/data/salon-info';
import { publicServices } from '@/modules/public-site/data/services';
import { publicStaff } from '@/modules/public-site/data/staff';

const SECTION_KEYS = ['hero', 'about', 'services', 'packages', 'staff', 'contact', 'seo'];

function parseJson(value, fallback = {}) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function bool(value) {
  return value === true || value === 1 || value === '1';
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function text(value, fallback = '') {
  return cleanText(value, fallback);
}

function imageUrl(value, fallback = '') {
  const cleaned = text(value, fallback);
  if (!cleaned) return fallback;
  if (cleaned.startsWith('/assets/') || cleaned.startsWith('/uploads/') || cleaned.startsWith('https://') || cleaned.startsWith('http://')) return cleaned;
  return fallback;
}

function safeLink(value, fallback = '') {
  const cleaned = text(value, fallback);
  if (!cleaned) return fallback;
  if (cleaned === 'whatsapp' || cleaned.startsWith('/') || cleaned.startsWith('https://') || cleaned.startsWith('http://')) return cleaned;
  return fallback;
}

function safeMapEmbed(value, fallback = salonInfo.mapEmbedUrl) {
  const cleaned = String(value || '').trim();
  if (!cleaned) return fallback;
  if (cleaned.includes('<script')) return fallback;
  const srcMatch = cleaned.match(/src=["']([^"']+)["']/i);
  const src = srcMatch ? srcMatch[1] : cleaned;
  return src.startsWith('https://www.google.com/maps/embed') ? src : fallback;
}

function sectionFallback() {
  return {
    hero: {
      sectionKey: 'hero',
      title: salonInfo.name,
      subtitle: salonInfo.tagline,
      description: salonInfo.description,
      imageUrl: salonInfo.assets.hero,
      buttonText: 'Book Appointment',
      buttonLink: '/book-appointment',
      secondaryButtonText: 'WhatsApp',
      secondaryButtonLink: 'whatsapp',
      isVisible: true,
      metadata: { eyebrow: 'Salon experience' }
    },
    about: {
      sectionKey: 'about',
      title: 'A Surkhet grooming space built for everyday confidence',
      subtitle: 'About',
      description: 'Our salon combines practical grooming, beauty care, and a clean professional setting.',
      imageUrl: salonInfo.assets.about,
      buttonText: '',
      buttonLink: '',
      secondaryButtonText: '',
      secondaryButtonLink: '',
      isVisible: true,
      metadata: { highlights: ['Premium finish', 'Friendly staff', 'Clear packages'], galleryImages: [salonInfo.assets.banner, salonInfo.assets.details] }
    },
    services: {
      sectionKey: 'services',
      title: 'Popular services',
      subtitle: 'Services',
      description: 'Fast, clear pricing for daily grooming and beauty care.',
      imageUrl: salonInfo.assets.services,
      buttonText: '',
      buttonLink: '',
      secondaryButtonText: '',
      secondaryButtonLink: '',
      isVisible: true,
      metadata: {}
    },
    packages: {
      sectionKey: 'packages',
      title: "Men's packages",
      subtitle: 'Packages',
      description: 'Grouped services for fast booking and clean billing.',
      imageUrl: '',
      buttonText: '',
      buttonLink: '',
      secondaryButtonText: '',
      secondaryButtonLink: '',
      isVisible: true,
      metadata: {}
    },
    staff: {
      sectionKey: 'staff',
      title: 'Meet the staff',
      subtitle: 'Team',
      description: 'Experienced staff for barbering, hair dressing, beauty care, and reception.',
      imageUrl: '',
      buttonText: '',
      buttonLink: '',
      secondaryButtonText: '',
      secondaryButtonLink: '',
      isVisible: true,
      metadata: {}
    },
    contact: {
      sectionKey: 'contact',
      title: 'Location and contact',
      subtitle: 'Visit us',
      description: 'Reach the salon or request an appointment through WhatsApp.',
      imageUrl: '',
      buttonText: 'Contact details',
      buttonLink: '/contact',
      secondaryButtonText: 'Book now',
      secondaryButtonLink: '/book-appointment',
      isVisible: true,
      metadata: {
        salonName: salonInfo.name,
        phone: salonInfo.phone,
        whatsappNumber: salonInfo.whatsappNumber,
        address: salonInfo.address,
        email: '',
        facebook: salonInfo.social.facebook,
        tiktok: salonInfo.social.tiktok,
        openingHours: salonInfo.openingHours,
        mapEmbedUrl: salonInfo.mapEmbedUrl
      }
    },
    seo: {
      sectionKey: 'seo',
      title: "The Hair Cut | Men's Salon in Birendranagar, Surkhet",
      subtitle: '',
      description: salonInfo.description,
      imageUrl: salonInfo.assets.ogImage,
      buttonText: '',
      buttonLink: '',
      secondaryButtonText: '',
      secondaryButtonLink: '',
      isVisible: true,
      metadata: {
        ogTitle: "The Hair Cut | Men's Salon in Birendranagar, Surkhet",
        ogDescription: salonInfo.description,
        keywords: 'salon, haircut, barber, surkhet, facial, shaving'
      }
    }
  };
}

function mapSection(row, fallback) {
  if (!row) return fallback;
  const metadata = { ...fallback.metadata, ...parseJson(row.metadata, {}) };
  if (row.section_key === 'contact') {
    metadata.mapEmbedUrl = safeMapEmbed(metadata.mapEmbedUrl, fallback.metadata.mapEmbedUrl);
    metadata.whatsappNumber = text(metadata.whatsappNumber, fallback.metadata.whatsappNumber).replace(/[^\d]/g, '') || fallback.metadata.whatsappNumber;
  }
  return {
    sectionKey: row.section_key,
    title: text(row.title, fallback.title),
    subtitle: text(row.subtitle, fallback.subtitle),
    description: text(row.description, fallback.description),
    imageUrl: imageUrl(row.image_url, fallback.imageUrl),
    buttonText: text(row.button_text, fallback.buttonText),
    buttonLink: safeLink(row.button_link, fallback.buttonLink),
    secondaryButtonText: text(row.secondary_button_text, fallback.secondaryButtonText),
    secondaryButtonLink: safeLink(row.secondary_button_link, fallback.secondaryButtonLink),
    isVisible: bool(row.is_visible),
    sortOrder: number(row.sort_order, fallback.sortOrder || 0),
    metadata
  };
}

function fallbackData() {
  const sections = sectionFallback();
  return {
    sections,
    info: {
      ...salonInfo,
      name: sections.contact.metadata.salonName || salonInfo.name,
      phone: sections.contact.metadata.phone || salonInfo.phone,
      whatsappNumber: sections.contact.metadata.whatsappNumber || salonInfo.whatsappNumber,
      address: sections.contact.metadata.address || salonInfo.address,
      openingHours: sections.contact.metadata.openingHours || salonInfo.openingHours,
      mapEmbedUrl: sections.contact.metadata.mapEmbedUrl || salonInfo.mapEmbedUrl,
      social: {
        facebook: sections.contact.metadata.facebook || salonInfo.social.facebook,
        tiktok: sections.contact.metadata.tiktok || salonInfo.social.tiktok
      },
      assets: {
        ...salonInfo.assets,
        hero: sections.hero.imageUrl || salonInfo.assets.hero,
        about: sections.about.imageUrl || salonInfo.assets.about,
        services: sections.services.imageUrl || salonInfo.assets.services,
        ogImage: sections.seo.imageUrl || salonInfo.assets.ogImage
      }
    },
    services: publicServices,
    popularServices: publicServices.filter((service) => ['Hair Cut', 'Shaving', 'Head Massage', 'Wine Facial'].includes(service.name)),
    packages: publicPackages,
    staff: publicStaff,
    gallery: galleryItems,
    seo: {
      title: sections.seo.title,
      description: sections.seo.description,
      openGraph: {
        title: sections.seo.metadata.ogTitle || sections.seo.title,
        description: sections.seo.metadata.ogDescription || sections.seo.description,
        images: [sections.seo.imageUrl || salonInfo.assets.ogImage]
      },
      keywords: sections.seo.metadata.keywords || ''
    }
  };
}

function mapService(row) {
  return {
    id: row.id,
    source: row.source || 'salon_service',
    name: row.name,
    priceLabel: row.price_label || (row.price > 0 ? `Rs. ${row.price}` : 'Consultation'),
    price: Number(row.price || 0),
    duration: Number(row.duration_minutes || 0),
    serviceCategory: row.category,
    category: row.is_package ? 'Package' : mapCategory(row.category),
    description: row.website_description || row.description || 'Salon service.',
    image: row.website_image || '',
    featured: bool(row.featured_on_website),
    showOnWebsite: bool(row.show_on_website),
    isPackage: bool(row.is_package),
    includes: String(row.package_items || '').split(',').map((item) => item.trim()).filter(Boolean),
    sortOrder: number(row.display_order, 0)
  };
}

function mapWebsiteService(row) {
  return mapService({
    ...row,
    source: 'website_service',
    price_label: row.price_label,
    duration_minutes: row.duration_minutes,
    website_image: row.image_url,
    website_description: row.description,
    featured_on_website: row.featured_on_website,
    show_on_website: row.show_on_website,
    package_items: row.package_items,
    is_package: row.is_package,
    display_order: row.display_order
  });
}

function mapWebsiteStaff(row) {
  return {
    id: row.id,
    source: 'website_staff',
    name: row.name,
    role: row.role_title || '',
    bio: row.bio || '',
    specialties: String(row.specialties || '').split(',').map((item) => item.trim()).filter(Boolean),
    image: row.image_url || undefined,
    featured: bool(row.featured_on_website),
    showOnWebsite: bool(row.show_on_website),
    sortOrder: number(row.display_order, 0)
  };
}

async function ensureWebsiteCmsRuntimeSchema(db) {
  await db.run(`
    CREATE TABLE IF NOT EXISTS website_services (
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT DEFAULT 'Other',
      price NUMERIC DEFAULT 0,
      price_label TEXT,
      duration_minutes INTEGER DEFAULT 30,
      description TEXT,
      image_url TEXT,
      is_package BOOLEAN DEFAULT FALSE,
      package_items TEXT,
      show_on_website BOOLEAN DEFAULT TRUE,
      featured_on_website BOOLEAN DEFAULT FALSE,
      display_order INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      updated_by BIGINT REFERENCES users(id) ON DELETE SET NULL
    )
  `);
  await db.run(`
    CREATE TABLE IF NOT EXISTS website_staff_profiles (
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      role_title TEXT,
      bio TEXT,
      specialties TEXT,
      image_url TEXT,
      show_on_website BOOLEAN DEFAULT TRUE,
      featured_on_website BOOLEAN DEFAULT FALSE,
      display_order INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      updated_by BIGINT REFERENCES users(id) ON DELETE SET NULL
    )
  `);
  await db.run('CREATE INDEX IF NOT EXISTS idx_website_services_visible_order ON website_services(show_on_website, display_order)');
  await db.run('CREATE INDEX IF NOT EXISTS idx_website_staff_visible_order ON website_staff_profiles(show_on_website, display_order)');
}

function mapCategory(category) {
  if (category === 'Beard') return 'Beard';
  if (['Facial', 'Makeup', 'Spa'].includes(category)) return 'Beauty';
  if (category === 'Treatment') return 'Treatment';
  return 'Hair';
}

function buildInfo(sections) {
  const contact = sections.contact.metadata;
  return {
    ...salonInfo,
    name: contact.salonName || salonInfo.name,
    phone: contact.phone || salonInfo.phone,
    whatsappNumber: contact.whatsappNumber || salonInfo.whatsappNumber,
    address: contact.address || salonInfo.address,
    openingHours: contact.openingHours || salonInfo.openingHours,
    mapEmbedUrl: contact.mapEmbedUrl || salonInfo.mapEmbedUrl,
    social: {
      facebook: contact.facebook || salonInfo.social.facebook,
      tiktok: contact.tiktok || salonInfo.social.tiktok
    },
    assets: {
      ...salonInfo.assets,
      hero: sections.hero.imageUrl || salonInfo.assets.hero,
      about: sections.about.imageUrl || salonInfo.assets.about,
      services: sections.services.imageUrl || salonInfo.assets.services,
      ogImage: sections.seo.imageUrl || salonInfo.assets.ogImage
    },
    copyright: `(c) ${new Date().getFullYear()} ${contact.salonName || salonInfo.name}. All rights reserved.`
  };
}

export async function getPublicWebsiteData(options = {}) {
  const includeHidden = Boolean(options.includeHidden);
  const fallback = fallbackData();
  try {
    const db = Database.getInstance();
    await ensureSalonSchema();
    await ensureWebsiteCmsRuntimeSchema(db);
    const defaults = sectionFallback();
    const rows = await db.all('SELECT * FROM website_content ORDER BY sort_order ASC, id ASC');
    const sections = { ...defaults };
    rows.forEach((row) => {
      if (SECTION_KEYS.includes(row.section_key)) {
        sections[row.section_key] = mapSection(row, defaults[row.section_key]);
      }
    });
    const websiteServiceRows = await db.all(`
      SELECT *
      FROM website_services
      ORDER BY display_order ASC, id ASC
    `);
    let services = [];
    let packages = [];
    if (websiteServiceRows.length) {
      const visibleWebsiteRows = includeHidden ? websiteServiceRows : websiteServiceRows.filter((row) => bool(row.show_on_website));
      services = visibleWebsiteRows.filter((row) => !bool(row.is_package)).map(mapWebsiteService);
      packages = visibleWebsiteRows.filter((row) => bool(row.is_package)).map((row) => {
        const mapped = mapWebsiteService(row);
        return {
          id: mapped.id,
          source: mapped.source,
          name: mapped.name,
          price: mapped.price,
          duration: mapped.duration,
          category: 'Other',
          isPackage: true,
          includes: mapped.includes,
          description: mapped.description,
          image: mapped.image,
          featured: mapped.featured,
          showOnWebsite: mapped.showOnWebsite,
          sortOrder: mapped.sortOrder
        };
      });
    } else {
      const serviceRows = await db.all(`
      SELECT *
      FROM salon_services
      WHERE is_active = TRUE ${includeHidden ? '' : 'AND COALESCE(show_on_website, TRUE) = TRUE'}
      ORDER BY COALESCE(featured_on_website, FALSE) DESC, is_package ASC, name ASC
    `);
      services = serviceRows.filter((row) => !row.is_package).map(mapService);
      packages = serviceRows.filter((row) => row.is_package).map((row) => {
        const mapped = mapService(row);
        return {
          id: mapped.id,
          source: mapped.source,
          name: mapped.name,
          price: mapped.price,
          duration: mapped.duration,
          category: 'Other',
          isPackage: true,
          includes: mapped.includes,
          description: mapped.description,
          image: mapped.image,
          featured: mapped.featured,
          showOnWebsite: mapped.showOnWebsite,
          sortOrder: mapped.sortOrder
        };
      });
    }

    const websiteStaffRows = await db.all(`
      SELECT *
      FROM website_staff_profiles
      ORDER BY display_order ASC, id ASC
    `);
    let staff = [];
    if (websiteStaffRows.length) {
      staff = (includeHidden ? websiteStaffRows : websiteStaffRows.filter((row) => bool(row.show_on_website))).map(mapWebsiteStaff);
    } else {
      const staffRows = await db.all(`
      SELECT u.id, u.full_name, sp.display_name, sp.salon_role, sp.assigned_services,
             sp.website_title, sp.website_bio, sp.website_photo, sp.show_on_website, sp.featured_on_website
      FROM users u
      JOIN staff_profiles sp ON sp.user_id = u.id
      WHERE u.is_active = TRUE
        AND sp.salon_role IN ('barber', 'stylist', 'beautician')
        ${includeHidden ? '' : 'AND COALESCE(sp.show_on_website, TRUE) = TRUE'}
      ORDER BY COALESCE(sp.featured_on_website, FALSE) DESC, u.full_name ASC
    `);
      staff = staffRows.map((row) => ({
      id: row.id,
      source: 'staff_profile',
      name: row.display_name || row.full_name,
      role: row.website_title || row.salon_role,
      bio: row.website_bio || '',
      specialties: String(row.assigned_services || '').split(',').map((item) => item.trim()).filter(Boolean),
      image: row.website_photo || undefined,
      featured: bool(row.featured_on_website),
      showOnWebsite: bool(row.show_on_website)
    }));
    }
    const galleryRows = await db.all(`
      SELECT *
      FROM website_gallery_images
      ${includeHidden ? '' : 'WHERE COALESCE(is_visible, TRUE) = TRUE'}
      ORDER BY sort_order ASC, id ASC
    `);
    const gallery = galleryRows.map((row) => ({
      id: row.id,
      title: row.title || row.alt_text || 'Salon photo',
      description: row.description || row.category || '',
      image: row.image_url,
      altText: row.alt_text || row.title || 'Salon photo',
      category: row.category || '',
      sortOrder: row.sort_order || 0,
      isVisible: bool(row.is_visible)
    }));
    return {
      sections,
      info: buildInfo(sections),
      services: services.length || websiteServiceRows.length ? services : fallback.services,
      popularServices: (services.filter((service) => service.featured).length ? services.filter((service) => service.featured) : services.slice(0, 4)).slice(0, 4),
      packages: packages.length || websiteServiceRows.length ? packages : fallback.packages,
      staff: staff.length || websiteStaffRows.length ? staff : fallback.staff,
      gallery: gallery.length || galleryRows.length ? gallery : fallback.gallery,
      seo: {
        title: sections.seo.title,
        description: sections.seo.description,
        openGraph: {
          title: sections.seo.metadata.ogTitle || sections.seo.title,
          description: sections.seo.metadata.ogDescription || sections.seo.description,
          images: [sections.seo.imageUrl || salonInfo.assets.ogImage]
        },
        keywords: sections.seo.metadata.keywords || ''
      }
    };
  } catch {
    return fallback;
  }
}

function normalizeSection(input, fallback) {
  const metadata = { ...(input.metadata || {}) };
  if (fallback.sectionKey === 'contact') {
    metadata.mapEmbedUrl = safeMapEmbed(metadata.mapEmbedUrl, fallback.metadata.mapEmbedUrl);
    metadata.whatsappNumber = text(metadata.whatsappNumber, fallback.metadata.whatsappNumber).replace(/[^\d]/g, '');
  }
  return {
    sectionKey: fallback.sectionKey,
    title: text(input.title, fallback.title),
    subtitle: text(input.subtitle, fallback.subtitle),
    description: text(input.description, fallback.description),
    imageUrl: imageUrl(input.imageUrl, fallback.imageUrl),
    buttonText: text(input.buttonText, ''),
    buttonLink: safeLink(input.buttonLink, ''),
    secondaryButtonText: text(input.secondaryButtonText, ''),
    secondaryButtonLink: safeLink(input.secondaryButtonLink, ''),
    isVisible: input.isVisible !== false,
    sortOrder: number(input.sortOrder, fallback.sortOrder || 0),
    metadata: JSON.stringify(metadata)
  };
}

export async function saveWebsiteCms(db, data, userId) {
  await ensureSalonSchema();
  await ensureWebsiteCmsRuntimeSchema(db);
  const defaults = sectionFallback();
  const sections = data.sections || {};
  for (const key of SECTION_KEYS) {
    const row = normalizeSection(sections[key] || {}, defaults[key]);
    await db.run(`
      INSERT INTO website_content (
        section_key, title, subtitle, description, image_url, button_text,
        button_link, secondary_button_text, secondary_button_link, is_visible,
        sort_order, metadata, updated_by, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
      ON CONFLICT (section_key) DO UPDATE SET
        title = EXCLUDED.title,
        subtitle = EXCLUDED.subtitle,
        description = EXCLUDED.description,
        image_url = EXCLUDED.image_url,
        button_text = EXCLUDED.button_text,
        button_link = EXCLUDED.button_link,
        secondary_button_text = EXCLUDED.secondary_button_text,
        secondary_button_link = EXCLUDED.secondary_button_link,
        is_visible = EXCLUDED.is_visible,
        sort_order = EXCLUDED.sort_order,
        metadata = EXCLUDED.metadata,
        updated_by = EXCLUDED.updated_by,
        updated_at = NOW()
    `, [
      row.sectionKey, row.title, row.subtitle, row.description, row.imageUrl,
      row.buttonText, row.buttonLink, row.secondaryButtonText, row.secondaryButtonLink,
      row.isVisible, row.sortOrder, row.metadata, userId,
    ]);
  }

  await db.run('DELETE FROM website_services');
  for (const [index, item] of [...(data.services || []), ...(data.packages || [])].entries()) {
    const isPackage = Boolean(item.isPackage);
    const name = text(item.name, isPackage ? 'Website Package' : 'Website Service');
    if (!name) continue;
    await db.run(`
      INSERT INTO website_services (
        name, category, price, price_label, duration_minutes, description,
        image_url, is_package, package_items, show_on_website, featured_on_website,
        display_order, updated_by, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
    `, [
      name,
      text(item.serviceCategory || item.category, isPackage ? 'Other' : 'Haircut'),
      Math.max(0, number(item.price, 0)),
      text(item.priceLabel, ''),
      Math.max(1, number(item.duration, item.duration_minutes || 30)),
      text(item.websiteDescription || item.description, ''),
      imageUrl(item.image || item.websiteImage, ''),
      isPackage,
      Array.isArray(item.includes) ? item.includes.map((value) => text(value, '')).filter(Boolean).join(',') : null,
      item.showOnWebsite !== false,
      Boolean(item.featured),
      number(item.sortOrder, index + 1),
      userId,
    ]);
  }

  await db.run('DELETE FROM website_staff_profiles');
  for (const [index, member] of (data.staff || []).entries()) {
    const name = text(member.name, 'Staff');
    if (!name) continue;
    await db.run(`
      INSERT INTO website_staff_profiles (
        name, role_title, bio, specialties, image_url, show_on_website,
        featured_on_website, display_order, updated_by, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
    `, [
      name,
      text(member.role, ''),
      text(member.bio, ''),
      Array.isArray(member.specialties) ? member.specialties.map((value) => text(value, '')).filter(Boolean).join(',') : '',
      imageUrl(member.image, ''),
      member.showOnWebsite !== false,
      Boolean(member.featured),
      number(member.sortOrder, index + 1),
      userId,
    ]);
  }

  const submittedGallery = Array.isArray(data.gallery) ? data.gallery : [];
  const submittedGalleryIds = submittedGallery.map((item) => Number(item.id || 0)).filter(Boolean);
  if (Array.isArray(data.gallery)) {
    if (submittedGalleryIds.length) {
      const placeholders = submittedGalleryIds.map(() => '?').join(',');
      await db.run(`DELETE FROM website_gallery_images WHERE id NOT IN (${placeholders})`, submittedGalleryIds);
    } else {
      await db.run('DELETE FROM website_gallery_images');
    }
  }

  for (const [index, item] of submittedGallery.entries()) {
    const url = imageUrl(item.image || item.imageUrl, '');
    if (!url) continue;
    const id = Number(item.id || 0) || null;
    await db.run(`
      INSERT INTO website_gallery_images (
        id, image_url, title, alt_text, category, description, sort_order,
        is_visible, updated_by, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
      ON CONFLICT (id) DO UPDATE SET
        image_url = EXCLUDED.image_url,
        title = EXCLUDED.title,
        alt_text = EXCLUDED.alt_text,
        category = EXCLUDED.category,
        description = EXCLUDED.description,
        sort_order = EXCLUDED.sort_order,
        is_visible = EXCLUDED.is_visible,
        updated_by = EXCLUDED.updated_by,
        updated_at = NOW()
    `, [
      id, url,
      text(item.title, 'Salon photo'),
      text(item.altText || item.alt_text, item.title || 'Salon photo'),
      text(item.category, ''),
      text(item.description, ''),
      number(item.sortOrder, index + 1),
      item.isVisible !== false,
      userId,
    ]);
  }

  await db.run(
    'INSERT INTO action_logs (user_id, action, entity_type, details) VALUES (?, ?, ?, ?)',
    [userId, 'update', 'website_cms', 'Website CMS updated']
  );
  return getPublicWebsiteData({ includeHidden: true });
}
