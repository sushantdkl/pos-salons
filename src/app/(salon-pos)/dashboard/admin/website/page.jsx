'use client';

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Edit, Eye, ImagePlus, Plus, Save, Trash2, X } from 'lucide-react';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { formatCurrency } from '@/lib/currency';

const tabs = ['Hero', 'About', 'Services', 'Packages', 'Staff', 'Gallery', 'Contact', 'SEO'];
const sectionMap = {
  Hero: 'hero',
  About: 'about',
  Services: 'services',
  Packages: 'packages',
  Staff: 'staff',
  Contact: 'contact',
  SEO: 'seo',
};
const listTabs = new Set(['Services', 'Packages', 'Staff', 'Gallery']);
const categories = ['Haircut', 'Hair Color', 'Facial', 'Beard', 'Treatment', 'Makeup', 'Spa', 'Other'];
const galleryCategories = [
  'Salon Space',
  'Haircut',
  'Hair Color',
  'Services',
  'Opening',
  'Customers',
  'Hygiene',
  'Exterior',
  'Before & After',
  'Events',
  'Reception',
  'Other',
];

const sectionPlaceholders = {
  Hero: {
    title: 'e.g. Welcome to The Hair Cut',
    subtitle: 'e.g. Premium grooming in Kathmandu',
    description: 'e.g. Precision cuts, clean shaves, and beauty care in a calm salon space.',
    buttonText: 'e.g. Book Appointment',
    buttonLink: 'e.g. /book-appointment',
    secondaryButtonText: 'e.g. WhatsApp Us',
    secondaryButtonLink: 'e.g. https://wa.me/97798XXXXXXXX',
  },
  About: {
    title: 'e.g. A calm space for everyday grooming',
    subtitle: 'e.g. About',
    description: 'e.g. Practical grooming and beauty care in a clean, professional setting.',
    buttonText: 'e.g. View gallery',
    buttonLink: 'e.g. /gallery',
    secondaryButtonText: 'e.g. Get in touch',
    secondaryButtonLink: 'e.g. /contact',
  },
  Services: {
    title: 'e.g. Our Services',
    subtitle: 'e.g. Rate card',
    description: 'e.g. Haircuts, coloring, facial, and more — priced clearly before you visit.',
  },
  Packages: {
    title: 'e.g. Value Packages',
    subtitle: 'e.g. Save more',
    description: 'e.g. Bundled services for everyday grooming and special occasions.',
  },
  Staff: {
    title: 'e.g. Meet Our Team',
    subtitle: 'e.g. Stylists & barbers',
    description: 'e.g. Experienced professionals ready for your next visit.',
  },
  Contact: {
    title: 'e.g. Visit Us',
    subtitle: 'e.g. Contact',
    description: 'e.g. Call, WhatsApp, or drop by during opening hours.',
    buttonText: 'e.g. Book Now',
    buttonLink: 'e.g. /book-appointment',
    secondaryButtonText: 'e.g. Get Directions',
    secondaryButtonLink: 'e.g. https://maps.google.com/...',
  },
  SEO: {
    title: 'e.g. The Hair Cut | Salon in Kathmandu',
    subtitle: 'e.g. Best haircut near you',
    description: 'e.g. Premium haircut, beard, and beauty services near [your area].',
  },
};

const contactPlaceholders = {
  salonName: 'e.g. The Hair Cut',
  phone: 'e.g. 98XXXXXXXX',
  whatsappNumber: 'e.g. 97798XXXXXXXX',
  address: 'e.g. Kathmandu, Nepal',
  email: 'e.g. hello@thehaircut.com',
  facebook: 'e.g. https://facebook.com/yourpage',
  tiktok: 'e.g. https://tiktok.com/@yourpage',
  openingHours: 'e.g. Sun–Fri 9:00 AM – 7:00 PM',
  mapEmbedUrl: 'e.g. https://www.google.com/maps/embed?pb=...',
};

const seoPlaceholders = {
  ogTitle: 'e.g. The Hair Cut — Premium Salon',
  ogDescription: 'e.g. Book haircuts, packages, and beauty services online.',
  keywords: 'e.g. haircut, salon, kathmandu, beard, facial',
};

function headers() {
  return {
    Authorization: `Bearer ${localStorage.getItem('pos_token')}`,
    'Content-Type': 'application/json',
  };
}

function authHeaders() {
  return {
    Authorization: `Bearer ${localStorage.getItem('pos_token')}`,
  };
}

function Field({ label, error, children }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-semibold text-gray-900">{label}</span>
      {children}
      {error ? <p className="mt-1 text-sm font-medium text-red-600">{error}</p> : null}
    </label>
  );
}

function inputClass(hasError) {
  return `w-full rounded-lg border px-4 py-3 text-gray-950 outline-none placeholder:text-gray-400 focus:ring-2 ${
    hasError ? 'border-red-300 focus:ring-red-200' : 'border-gray-300 focus:ring-gray-900'
  }`;
}

function TextInput({ error, className = '', ...props }) {
  return <input {...props} className={`${inputClass(Boolean(error))} ${className}`} />;
}

function TextArea({ error, className = '', ...props }) {
  return <textarea {...props} className={`${inputClass(Boolean(error))} ${className}`} />;
}

function Toggle({ checked, onChange, label }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`rounded-full px-3 py-1.5 text-xs font-semibold ${checked ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}
    >
      {label}: {checked ? 'Shown' : 'Hidden'}
    </button>
  );
}

function StatusPill({ visible, featured }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${visible ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-500'}`}>
        {visible ? 'Visible' : 'Hidden'}
      </span>
      {featured ? (
        <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">Featured</span>
      ) : null}
    </div>
  );
}

function uploadFolderForSection(tab) {
  if (tab === 'SEO') return 'seo';
  if (tab === 'Services') return 'services';
  if (tab === 'Packages') return 'packages';
  if (tab === 'Staff') return 'staff';
  if (tab === 'Gallery') return 'gallery';
  return 'banners';
}

function CmsModal({ open, title, onClose, onSave, children, saveLabel = 'Save item' }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
          <h3 className="text-lg font-semibold text-gray-950">{title}</h3>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-5">{children}</div>
        <div className="flex gap-3 border-t border-gray-200 px-5 py-4">
          <button type="button" onClick={onClose} className="flex-1 rounded-xl border border-gray-300 px-4 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50">
            Cancel
          </button>
          <button type="button" onClick={onSave} className="flex-1 rounded-xl bg-gray-950 px-4 py-3 text-sm font-semibold text-white hover:bg-gray-800">
            {saveLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function CmsListRow({ image, title, subtitle, description, meta, visible, featured, onEdit, onDelete }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-3 py-3 transition hover:border-gray-300 hover:bg-gray-50/80 sm:gap-4 sm:px-4">
      <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-gray-100 sm:h-16 sm:w-16">
        {image ? (
          <Image src={image} alt={title || 'Item'} fill sizes="64px" className="object-cover" unoptimized />
        ) : (
          <div className="flex h-full items-center justify-center text-[10px] font-semibold uppercase tracking-wide text-gray-400">No image</div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="truncate text-sm font-semibold text-gray-950 sm:text-base">{title || 'Untitled'}</h3>
          {subtitle ? <span className="truncate text-xs font-medium text-gray-500">{subtitle}</span> : null}
        </div>
        {description ? <p className="mt-0.5 line-clamp-1 text-sm text-gray-600">{description}</p> : null}
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          {meta ? <span className="text-xs font-semibold text-gray-800">{meta}</span> : null}
          <StatusPill visible={visible !== false} featured={Boolean(featured)} />
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <button type="button" onClick={onEdit} className="rounded-lg p-2 text-blue-600 hover:bg-blue-50" title="Edit">
          <Edit className="h-4 w-4" />
        </button>
        <button type="button" onClick={onDelete} className="rounded-lg p-2 text-red-600 hover:bg-red-50" title="Delete">
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

export default function WebsiteCmsPage() {
  const [activeTab, setActiveTab] = useState('Hero');
  const [cms, setCms] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const loadCms = async () => {
    setLoading(true);
    setError('');
    const response = await fetch('/api/admin/website-cms', { headers: headers() });
    const data = await response.json();
    if (response.ok) setCms(data);
    else setError(data.error || 'Could not load website CMS');
    setLoading(false);
  };

  useEffect(() => {
    loadCms();
  }, []);

  const updateSection = (key, patch) => {
    setCms((current) => ({
      ...current,
      sections: {
        ...current.sections,
        [key]: { ...current.sections[key], ...patch },
      },
    }));
  };

  const updateSectionMetadata = (key, patch) => {
    setCms((current) => ({
      ...current,
      sections: {
        ...current.sections,
        [key]: {
          ...current.sections[key],
          metadata: { ...(current.sections[key].metadata || {}), ...patch },
        },
      },
    }));
  };

  const updateList = (listKey, index, patch) => {
    setCms((current) => ({
      ...current,
      [listKey]: current[listKey].map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)),
    }));
  };

  const addListItem = (listKey, item) => {
    setCms((current) => ({
      ...current,
      [listKey]: [{ ...item, isNew: true }, ...(current[listKey] || [])],
    }));
  };

  const removeListItem = (listKey, index) => {
    setCms((current) => ({
      ...current,
      [listKey]: current[listKey].filter((_, itemIndex) => itemIndex !== index),
    }));
  };

  const uploadImage = async (folder, file) => {
    setMessage('');
    setError('');
    const formData = new FormData();
    formData.append('folder', folder);
    formData.append('file', file);
    const response = await fetch('/api/admin/website-cms/upload', {
      method: 'POST',
      headers: authHeaders(),
      body: formData,
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Image upload failed');
    }
    setMessage('Image uploaded. Save CMS to publish this change.');
    return data.imageUrl;
  };

  const save = async () => {
    setSaving(true);
    setMessage('');
    setError('');

    const validation = validateCmsPayload(cms);
    if (validation) {
      setActiveTab(validation.tab);
      setError(`${validation.tab}: ${validation.message}`);
      setSaving(false);
      return;
    }

    const response = await fetch('/api/admin/website-cms', {
      method: 'PUT',
      headers: headers(),
      body: JSON.stringify(cms),
    });
    const data = await response.json();
    if (response.ok) {
      setCms(data.cms);
      setMessage('Website CMS saved. Public website updated.');
    } else {
      if (data.details?.tab) setActiveTab(data.details.tab);
      setError(data.message || data.error || 'Could not save website CMS. Please check the fields and try again.');
    }
    setSaving(false);
  };

  const activeSection = useMemo(() => cms?.sections?.[sectionMap[activeTab]], [activeTab, cms]);
  const showFullSectionForm = activeSection && !listTabs.has(activeTab);
  const showListSectionHeader = activeSection && listTabs.has(activeTab) && activeTab !== 'Gallery';
  const placeholders = sectionPlaceholders[activeTab] || {};

  if (loading) {
    return <div className="min-h-screen bg-gray-50 p-6 text-gray-600">Loading Website CMS...</div>;
  }

  if (!cms) {
    return <div className="min-h-screen bg-gray-50 p-6 text-red-700">{error || 'Website CMS unavailable.'}</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6">
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-950 sm:text-3xl">Website CMS</h1>
          <p className="mt-1 text-sm text-gray-600">
            Content here drives the live public website. Save after changes, then preview.
          </p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap">
          <Link href="/" target="_blank" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-3 font-semibold text-gray-700">
            <Eye className="h-4 w-4" /> Preview Website
          </Link>
          <button onClick={save} disabled={saving} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-gray-950 px-5 py-3 font-semibold text-white disabled:opacity-60">
            <Save className="h-4 w-4" /> {saving ? 'Saving...' : 'Save CMS'}
          </button>
        </div>
      </div>

      {message ? <div className="mb-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm font-semibold text-green-700">{message}</div> : null}
      {error ? <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</div> : null}

      <div className="-mx-1 mb-5 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:thin]">
        <div className="flex min-w-max gap-2 rounded-lg border border-gray-200 bg-white p-2">
          {tabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`min-h-11 shrink-0 rounded-md px-4 py-2.5 text-sm font-semibold ${activeTab === tab ? 'bg-gray-950 text-white' : 'text-gray-700 hover:bg-gray-100'}`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {showFullSectionForm ? (
        <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-xl font-semibold text-gray-950">{activeTab} Section</h2>
            <Toggle checked={activeSection.isVisible} onChange={(value) => updateSection(activeSection.sectionKey, { isVisible: value })} label="Section" />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Title">
              <TextInput
                placeholder={placeholders.title}
                value={activeSection.title || ''}
                onChange={(event) => updateSection(activeSection.sectionKey, { title: event.target.value })}
              />
            </Field>
            <Field label="Subtitle / Eyebrow">
              <TextInput
                placeholder={placeholders.subtitle}
                value={activeSection.subtitle || ''}
                onChange={(event) => updateSection(activeSection.sectionKey, { subtitle: event.target.value })}
              />
            </Field>
            <ImageUploadField
              label={activeTab === 'About' ? 'About photo' : 'Section Image'}
              value={activeSection.imageUrl || ''}
              folder={uploadFolderForSection(activeTab)}
              onUpload={uploadImage}
              onChange={(imageUrl) => updateSection(activeSection.sectionKey, { imageUrl })}
            />
            <Field label="Primary CTA Text">
              <TextInput
                placeholder={placeholders.buttonText}
                value={activeSection.buttonText || ''}
                onChange={(event) => updateSection(activeSection.sectionKey, { buttonText: event.target.value })}
              />
            </Field>
            <Field label="Primary CTA Link">
              <TextInput
                placeholder={placeholders.buttonLink}
                value={activeSection.buttonLink || ''}
                onChange={(event) => updateSection(activeSection.sectionKey, { buttonLink: event.target.value })}
              />
            </Field>
            <Field label="Secondary CTA Text">
              <TextInput
                placeholder={placeholders.secondaryButtonText}
                value={activeSection.secondaryButtonText || ''}
                onChange={(event) => updateSection(activeSection.sectionKey, { secondaryButtonText: event.target.value })}
              />
            </Field>
            <Field label="Secondary CTA Link">
              <TextInput
                placeholder={placeholders.secondaryButtonLink}
                value={activeSection.secondaryButtonLink || ''}
                onChange={(event) => updateSection(activeSection.sectionKey, { secondaryButtonLink: event.target.value })}
              />
            </Field>
            <Field label="Description">
              <TextArea
                rows={5}
                placeholder={placeholders.description}
                value={activeSection.description || ''}
                onChange={(event) => updateSection(activeSection.sectionKey, { description: event.target.value })}
              />
            </Field>
          </div>
          {activeTab === 'About' ? (
            <div className="mt-6 grid gap-4">
              <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700">
                Homepage About shows: title, description, the Section Image, three highlight lines, and the CTA buttons.
              </div>
              <Field label="Highlight points (comma separated)">
                <TextInput
                  placeholder="e.g. Premium finish, Friendly staff, Clear packages"
                  value={Array.isArray(activeSection.metadata?.highlights) ? activeSection.metadata.highlights.join(', ') : ''}
                  onChange={(event) =>
                    updateSectionMetadata('about', {
                      highlights: event.target.value
                        .split(',')
                        .map((item) => item.trim())
                        .filter(Boolean)
                        .slice(0, 3),
                    })
                  }
                />
              </Field>
            </div>
          ) : null}
          {activeTab === 'Contact' ? (
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              {[
                ['salonName', 'Salon Name'],
                ['phone', 'Phone'],
                ['whatsappNumber', 'WhatsApp Number'],
                ['address', 'Address'],
                ['email', 'Email'],
                ['facebook', 'Facebook Link'],
                ['tiktok', 'TikTok Link'],
                ['openingHours', 'Opening Hours'],
              ].map(([key, label]) => (
                <Field key={key} label={label}>
                  <TextInput
                    placeholder={contactPlaceholders[key]}
                    value={activeSection.metadata?.[key] || ''}
                    onChange={(event) => updateSectionMetadata('contact', { [key]: event.target.value })}
                  />
                </Field>
              ))}
              <div className="md:col-span-2">
                <Field label="Google Map Embed URL or iframe">
                  <TextArea
                    rows={4}
                    placeholder={contactPlaceholders.mapEmbedUrl}
                    value={activeSection.metadata?.mapEmbedUrl || ''}
                    onChange={(event) => updateSectionMetadata('contact', { mapEmbedUrl: event.target.value })}
                  />
                </Field>
              </div>
            </div>
          ) : null}
          {activeTab === 'SEO' ? (
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <Field label="Open Graph Title">
                <TextInput
                  placeholder={seoPlaceholders.ogTitle}
                  value={activeSection.metadata?.ogTitle || ''}
                  onChange={(event) => updateSectionMetadata('seo', { ogTitle: event.target.value })}
                />
              </Field>
              <Field label="Open Graph Description">
                <TextArea
                  rows={3}
                  placeholder={seoPlaceholders.ogDescription}
                  value={activeSection.metadata?.ogDescription || ''}
                  onChange={(event) => updateSectionMetadata('seo', { ogDescription: event.target.value })}
                />
              </Field>
              <Field label="Keywords">
                <TextInput
                  placeholder={seoPlaceholders.keywords}
                  value={activeSection.metadata?.keywords || ''}
                  onChange={(event) => updateSectionMetadata('seo', { keywords: event.target.value })}
                />
              </Field>
            </div>
          ) : null}
        </section>
      ) : null}

      {showListSectionHeader ? (
        <section className="mb-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-gray-950">{activeTab} page header</h2>
            <Toggle checked={activeSection.isVisible} onChange={(value) => updateSection(activeSection.sectionKey, { isVisible: value })} label="Section" />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Section title">
              <TextInput
                placeholder={placeholders.title}
                value={activeSection.title || ''}
                onChange={(event) => updateSection(activeSection.sectionKey, { title: event.target.value })}
              />
            </Field>
            <Field label="Section description">
              <TextInput
                placeholder={placeholders.description}
                value={activeSection.description || ''}
                onChange={(event) => updateSection(activeSection.sectionKey, { description: event.target.value })}
              />
            </Field>
          </div>
        </section>
      ) : null}

      {activeTab === 'Services' ? (
        <ServiceEditor cms={cms} updateList={updateList} addListItem={addListItem} removeListItem={removeListItem} uploadImage={uploadImage} />
      ) : null}
      {activeTab === 'Packages' ? (
        <PackageEditor cms={cms} updateList={updateList} addListItem={addListItem} removeListItem={removeListItem} uploadImage={uploadImage} />
      ) : null}
      {activeTab === 'Staff' ? (
        <StaffEditor cms={cms} updateList={updateList} addListItem={addListItem} removeListItem={removeListItem} uploadImage={uploadImage} />
      ) : null}
      {activeTab === 'Gallery' ? (
        <GalleryEditor cms={cms} setCms={setCms} uploadImage={uploadImage} />
      ) : null}
    </div>
  );
}

function ImageUploadField({ label, value, folder, onChange, onUpload, error }) {
  const [uploading, setUploading] = useState(false);
  const [localError, setLocalError] = useState('');

  const handleFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setUploading(true);
    setLocalError('');
    try {
      const uploadedUrl = await onUpload(folder, file);
      onChange(uploadedUrl);
    } catch (uploadError) {
      setLocalError(uploadError.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="grid gap-3">
      <Field label={label} error={error || localError}>
        <div className={`grid gap-3 rounded-lg border bg-gray-50 p-3 ${error || localError ? 'border-red-300' : 'border-gray-200'}`}>
          {value ? (
            <div className="relative h-36 overflow-hidden rounded-md bg-white">
              <Image src={value} alt={label} fill sizes="320px" className="object-cover" unoptimized />
            </div>
          ) : (
            <div className="flex h-36 items-center justify-center rounded-md border border-dashed border-gray-300 bg-white text-sm font-semibold text-gray-500">
              No image selected
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-gray-950 px-4 py-2 text-sm font-semibold text-white">
              <ImagePlus className="h-4 w-4" /> {value ? 'Replace Image' : 'Upload Image'}
              <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleFile} disabled={uploading} />
            </label>
            {value ? (
              <button type="button" onClick={() => onChange('')} className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-700">
                <X className="h-4 w-4" /> Remove Image
              </button>
            ) : null}
          </div>
          {uploading ? <p className="text-sm font-semibold text-gray-600">Uploading image...</p> : null}
        </div>
      </Field>
    </div>
  );
}

function useItemEditor(defaults) {
  const [draft, setDraft] = useState(null);
  const [editIndex, setEditIndex] = useState(null);
  const [deleteIndex, setDeleteIndex] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});

  const openCreate = () => {
    setEditIndex(null);
    setFieldErrors({});
    setDraft({ ...defaults });
  };

  const openEdit = (index, item) => {
    setEditIndex(index);
    setFieldErrors({});
    setDraft({ ...item });
  };

  const close = () => {
    setDraft(null);
    setEditIndex(null);
    setFieldErrors({});
  };

  const patchDraft = (patch) => {
    setDraft((current) => ({ ...current, ...patch }));
    const cleared = {};
    Object.keys(patch).forEach((key) => { cleared[key] = ''; });
    setFieldErrors((current) => ({ ...current, ...cleared }));
  };

  return {
    draft,
    editIndex,
    deleteIndex,
    setDeleteIndex,
    fieldErrors,
    setFieldErrors,
    openCreate,
    openEdit,
    close,
    patchDraft,
    isEditing: editIndex !== null,
  };
}

function validateCmsPayload(cms) {
  for (const [index, service] of (cms.services || []).entries()) {
    if (!String(service.name || '').trim()) {
      return { tab: 'Services', index, field: 'name', message: 'Service name is required.' };
    }
  }
  for (const [index, item] of (cms.packages || []).entries()) {
    if (!String(item.name || '').trim()) {
      return { tab: 'Packages', index, field: 'name', message: 'Package name is required.' };
    }
  }
  for (const [index, member] of (cms.staff || []).entries()) {
    if (!String(member.name || '').trim()) {
      return { tab: 'Staff', index, field: 'name', message: 'Staff display name is required.' };
    }
  }
  for (const [index, item] of (cms.gallery || []).entries()) {
    if (!String(item.image || item.imageUrl || '').trim()) {
      return { tab: 'Gallery', index, field: 'image', message: 'Please upload an image for each gallery photo.' };
    }
  }
  return null;
}

function ServiceEditor({ cms, updateList, addListItem, removeListItem, uploadImage }) {
  const editor = useItemEditor({
    name: '',
    serviceCategory: 'Haircut',
    price: '',
    duration: '',
    description: '',
    image: '',
    featured: false,
    showOnWebsite: true,
    sortOrder: 1,
  });

  const saveItem = () => {
    const errors = {};
    if (!editor.draft?.name?.trim()) errors.name = 'Service name is required.';
    if (Number(editor.draft?.price) < 0) errors.price = 'Price cannot be negative.';
    if (Number(editor.draft?.duration) < 1) errors.duration = 'Duration must be at least 1 minute.';
    if (Object.keys(errors).length) {
      editor.setFieldErrors(errors);
      return;
    }
    const payload = {
      ...editor.draft,
      name: editor.draft.name.trim(),
      websiteDescription: editor.draft.description || '',
      price: Number(editor.draft.price || 0),
      duration: Number(editor.draft.duration || 30),
    };
    if (editor.isEditing) updateList('services', editor.editIndex, payload);
    else addListItem('services', payload);
    editor.close();
  };

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-gray-950">Website Services</h2>
          <p className="mt-1 text-sm text-gray-500">Shown on the public Services page and homepage.</p>
        </div>
        <button onClick={editor.openCreate} className="inline-flex items-center gap-2 rounded-lg bg-gray-950 px-4 py-2 font-semibold text-white">
          <Plus className="h-4 w-4" /> Add Service
        </button>
      </div>
      <div className="grid gap-2">
        {(cms.services || []).map((service, index) => (
          <CmsListRow
            key={`${service.id || service.name || 'service'}-${index}`}
            image={service.image}
            title={service.name}
            subtitle={service.serviceCategory}
            description={service.description}
            meta={`${formatCurrency(service.price || 0)}${service.duration ? ` · ${service.duration} min` : ''}`}
            visible={service.showOnWebsite !== false}
            featured={service.featured}
            onEdit={() => editor.openEdit(index, service)}
            onDelete={() => editor.setDeleteIndex(index)}
          />
        ))}
        {(cms.services || []).length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-200 py-10 text-center text-sm text-gray-500">No website services yet.</div>
        ) : null}
      </div>

      <CmsModal
        open={Boolean(editor.draft)}
        title={editor.isEditing ? 'Edit service' : 'Add service'}
        onClose={editor.close}
        onSave={saveItem}
        saveLabel={editor.isEditing ? 'Update service' : 'Add service'}
      >
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Name *" error={editor.fieldErrors.name}>
            <TextInput
              error={editor.fieldErrors.name}
              placeholder="e.g. Classic Haircut"
              value={editor.draft?.name || ''}
              onChange={(event) => editor.patchDraft({ name: event.target.value })}
            />
          </Field>
          <Field label="Category">
            <select value={editor.draft?.serviceCategory || 'Haircut'} onChange={(event) => editor.patchDraft({ serviceCategory: event.target.value })} className={inputClass(false)}>
              {categories.map((category) => <option key={category} value={category}>{category}</option>)}
            </select>
          </Field>
          <Field label="Price" error={editor.fieldErrors.price}>
            <TextInput
              error={editor.fieldErrors.price}
              type="number"
              min="0"
              placeholder="e.g. 500"
              value={editor.draft?.price ?? ''}
              onChange={(event) => editor.patchDraft({ price: event.target.value })}
            />
          </Field>
          <Field label="Duration (minutes)" error={editor.fieldErrors.duration}>
            <TextInput
              error={editor.fieldErrors.duration}
              type="number"
              min="1"
              placeholder="e.g. 30"
              value={editor.draft?.duration ?? ''}
              onChange={(event) => editor.patchDraft({ duration: event.target.value })}
            />
          </Field>
          <div className="md:col-span-2">
            <Field label="Description">
              <TextArea
                rows={3}
                placeholder="e.g. Precision cut with wash and styling — includes a quick consultation."
                value={editor.draft?.description || ''}
                onChange={(event) => editor.patchDraft({ description: event.target.value })}
              />
            </Field>
          </div>
          <div className="md:col-span-2">
            <ImageUploadField label="Service image" value={editor.draft?.image || ''} folder="services" onUpload={uploadImage} onChange={(image) => editor.patchDraft({ image })} />
          </div>
          <div className="flex flex-wrap gap-2 md:col-span-2">
            <Toggle checked={editor.draft?.showOnWebsite !== false} onChange={(value) => editor.patchDraft({ showOnWebsite: value })} label="Website" />
            <button type="button" onClick={() => editor.patchDraft({ featured: !editor.draft?.featured })} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${editor.draft?.featured ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-600'}`}>
              Featured: {editor.draft?.featured ? 'Yes' : 'No'}
            </button>
          </div>
        </div>
      </CmsModal>

      <ConfirmDialog
        open={editor.deleteIndex !== null}
        title="Delete service"
        description={`Remove "${cms.services?.[editor.deleteIndex]?.name || 'this service'}" from the website CMS? Remember to Save CMS after deleting.`}
        confirmLabel="Delete"
        destructive
        onCancel={() => editor.setDeleteIndex(null)}
        onConfirm={() => {
          removeListItem('services', editor.deleteIndex);
          editor.setDeleteIndex(null);
        }}
      />
    </section>
  );
}

function PackageEditor({ cms, updateList, addListItem, removeListItem, uploadImage }) {
  const editor = useItemEditor({
    name: '',
    price: '',
    image: '',
    description: '',
    includes: [],
    isPackage: true,
    category: 'Other',
    featured: false,
    showOnWebsite: true,
    sortOrder: 1,
  });

  const saveItem = () => {
    const errors = {};
    if (!editor.draft?.name?.trim()) errors.name = 'Package name is required.';
    if (Number(editor.draft?.price) < 0) errors.price = 'Price cannot be negative.';
    if (Object.keys(errors).length) {
      editor.setFieldErrors(errors);
      return;
    }
    const payload = {
      ...editor.draft,
      name: editor.draft.name.trim(),
      isPackage: true,
      category: 'Other',
      websiteDescription: editor.draft.description || '',
      price: Number(editor.draft.price || 0),
      includes: Array.isArray(editor.draft.includes) ? editor.draft.includes : [],
    };
    if (editor.isEditing) updateList('packages', editor.editIndex, payload);
    else addListItem('packages', payload);
    editor.close();
  };

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-gray-950">Website Packages</h2>
          <p className="mt-1 text-sm text-gray-500">Shown on the public Packages page.</p>
        </div>
        <button onClick={editor.openCreate} className="inline-flex items-center gap-2 rounded-lg bg-gray-950 px-4 py-2 font-semibold text-white">
          <Plus className="h-4 w-4" /> Add Package
        </button>
      </div>
      <div className="grid gap-2">
        {(cms.packages || []).map((item, index) => (
          <CmsListRow
            key={`${item.id || item.name || 'package'}-${index}`}
            image={item.image}
            title={item.name}
            description={item.description}
            meta={formatCurrency(item.price || 0)}
            visible={item.showOnWebsite !== false}
            featured={item.featured}
            onEdit={() => editor.openEdit(index, item)}
            onDelete={() => editor.setDeleteIndex(index)}
          />
        ))}
        {(cms.packages || []).length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-200 py-10 text-center text-sm text-gray-500">No website packages yet.</div>
        ) : null}
      </div>

      <CmsModal
        open={Boolean(editor.draft)}
        title={editor.isEditing ? 'Edit package' : 'Add package'}
        onClose={editor.close}
        onSave={saveItem}
        saveLabel={editor.isEditing ? 'Update package' : 'Add package'}
      >
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Package name *" error={editor.fieldErrors.name}>
            <TextInput
              error={editor.fieldErrors.name}
              placeholder="e.g. Grooming Combo"
              value={editor.draft?.name || ''}
              onChange={(event) => editor.patchDraft({ name: event.target.value })}
            />
          </Field>
          <Field label="Price" error={editor.fieldErrors.price}>
            <TextInput
              error={editor.fieldErrors.price}
              type="number"
              min="0"
              placeholder="e.g. 1499"
              value={editor.draft?.price ?? ''}
              onChange={(event) => editor.patchDraft({ price: event.target.value })}
            />
          </Field>
          <div className="md:col-span-2">
            <Field label="Description">
              <TextArea
                rows={3}
                placeholder="e.g. Best value bundle for a full refresh — cut, wash, and style."
                value={editor.draft?.description || ''}
                onChange={(event) => editor.patchDraft({ description: event.target.value })}
              />
            </Field>
          </div>
          <div className="md:col-span-2">
            <Field label="Included services">
              <TextInput
                value={(editor.draft?.includes || []).join(', ')}
                onChange={(event) => editor.patchDraft({
                  includes: event.target.value.split(',').map((value) => value.trim()).filter(Boolean),
                })}
                placeholder="e.g. Hair Cut, Hair Wash, Shaving"
              />
            </Field>
          </div>
          <div className="md:col-span-2">
            <ImageUploadField label="Package image" value={editor.draft?.image || ''} folder="packages" onUpload={uploadImage} onChange={(image) => editor.patchDraft({ image })} />
          </div>
          <div className="flex flex-wrap gap-2 md:col-span-2">
            <Toggle checked={editor.draft?.showOnWebsite !== false} onChange={(value) => editor.patchDraft({ showOnWebsite: value })} label="Website" />
            <button type="button" onClick={() => editor.patchDraft({ featured: !editor.draft?.featured })} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${editor.draft?.featured ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-600'}`}>
              Featured: {editor.draft?.featured ? 'Yes' : 'No'}
            </button>
          </div>
        </div>
      </CmsModal>

      <ConfirmDialog
        open={editor.deleteIndex !== null}
        title="Delete package"
        description={`Remove "${cms.packages?.[editor.deleteIndex]?.name || 'this package'}" from the website CMS? Remember to Save CMS after deleting.`}
        confirmLabel="Delete"
        destructive
        onCancel={() => editor.setDeleteIndex(null)}
        onConfirm={() => {
          removeListItem('packages', editor.deleteIndex);
          editor.setDeleteIndex(null);
        }}
      />
    </section>
  );
}

function StaffEditor({ cms, updateList, addListItem, removeListItem, uploadImage }) {
  const editor = useItemEditor({
    name: '',
    role: 'Salon Professional',
    bio: '',
    specialties: [],
    image: '',
    featured: false,
    showOnWebsite: true,
    sortOrder: 1,
  });

  const saveItem = () => {
    const errors = {};
    if (!editor.draft?.name?.trim()) errors.name = 'Staff display name is required.';
    if (Object.keys(errors).length) {
      editor.setFieldErrors(errors);
      return;
    }
    const payload = {
      ...editor.draft,
      name: editor.draft.name.trim(),
      specialties: Array.isArray(editor.draft.specialties) ? editor.draft.specialties : [],
    };
    if (editor.isEditing) updateList('staff', editor.editIndex, payload);
    else addListItem('staff', payload);
    editor.close();
  };

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-gray-950">Website Staff</h2>
          <p className="mt-1 text-sm text-gray-500">Public staff cards only. PINs and salaries stay in Staff admin.</p>
        </div>
        <button onClick={editor.openCreate} className="inline-flex items-center gap-2 rounded-lg bg-gray-950 px-4 py-2 font-semibold text-white">
          <Plus className="h-4 w-4" /> Add Staff
        </button>
      </div>
      <div className="grid gap-2">
        {(cms.staff || []).map((member, index) => (
          <CmsListRow
            key={`${member.id || member.name || 'staff'}-${index}`}
            image={member.image}
            title={member.name}
            subtitle={member.role}
            description={member.bio}
            visible={member.showOnWebsite !== false}
            featured={member.featured}
            onEdit={() => editor.openEdit(index, member)}
            onDelete={() => editor.setDeleteIndex(index)}
          />
        ))}
        {(cms.staff || []).length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-200 py-10 text-center text-sm text-gray-500">No website staff cards yet.</div>
        ) : null}
      </div>

      <CmsModal
        open={Boolean(editor.draft)}
        title={editor.isEditing ? 'Edit staff card' : 'Add staff card'}
        onClose={editor.close}
        onSave={saveItem}
        saveLabel={editor.isEditing ? 'Update staff' : 'Add staff'}
      >
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Display name *" error={editor.fieldErrors.name}>
            <TextInput
              error={editor.fieldErrors.name}
              placeholder="e.g. Sita Sharma"
              value={editor.draft?.name || ''}
              onChange={(event) => editor.patchDraft({ name: event.target.value })}
            />
          </Field>
          <Field label="Role / title">
            <TextInput
              placeholder="e.g. Senior Stylist"
              value={editor.draft?.role || ''}
              onChange={(event) => editor.patchDraft({ role: event.target.value })}
            />
          </Field>
          <div className="md:col-span-2">
            <Field label="Bio">
              <TextArea
                rows={3}
                placeholder="e.g. 8+ years in precision cuts and bridal styling."
                value={editor.draft?.bio || ''}
                onChange={(event) => editor.patchDraft({ bio: event.target.value })}
              />
            </Field>
          </div>
          <div className="md:col-span-2">
            <Field label="Specialties">
              <TextInput
                value={(editor.draft?.specialties || []).join(', ')}
                onChange={(event) => editor.patchDraft({
                  specialties: event.target.value.split(',').map((value) => value.trim()).filter(Boolean),
                })}
                placeholder="e.g. Hair Cut, Beard, Facial"
              />
            </Field>
          </div>
          <div className="md:col-span-2">
            <ImageUploadField label="Staff photo" value={editor.draft?.image || ''} folder="staff" onUpload={uploadImage} onChange={(image) => editor.patchDraft({ image })} />
          </div>
          <div className="flex flex-wrap gap-2 md:col-span-2">
            <Toggle checked={editor.draft?.showOnWebsite !== false} onChange={(value) => editor.patchDraft({ showOnWebsite: value })} label="Website" />
            <button type="button" onClick={() => editor.patchDraft({ featured: !editor.draft?.featured })} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${editor.draft?.featured ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-600'}`}>
              Featured: {editor.draft?.featured ? 'Yes' : 'No'}
            </button>
          </div>
        </div>
      </CmsModal>

      <ConfirmDialog
        open={editor.deleteIndex !== null}
        title="Delete staff card"
        description={`Remove "${cms.staff?.[editor.deleteIndex]?.name || 'this staff card'}" from the website? Remember to Save CMS after deleting.`}
        confirmLabel="Delete"
        destructive
        onCancel={() => editor.setDeleteIndex(null)}
        onConfirm={() => {
          removeListItem('staff', editor.deleteIndex);
          editor.setDeleteIndex(null);
        }}
      />
    </section>
  );
}

function GalleryEditor({ cms, setCms, uploadImage }) {
  const editor = useItemEditor({
    image: '',
    title: '',
    altText: '',
    category: 'Salon Space',
    description: '',
    sortOrder: 1,
    isVisible: true,
  });

  const categoryOptions = useMemo(() => {
    const options = new Set(galleryCategories);
    (cms.gallery || []).forEach((item) => {
      if (item.category) options.add(item.category);
    });
    return Array.from(options);
  }, [cms.gallery]);

  const saveItem = () => {
    const errors = {};
    if (!String(editor.draft?.image || '').trim()) errors.image = 'Please upload a gallery image.';
    if (!String(editor.draft?.title || '').trim()) errors.title = 'Photo title is required.';
    if (Object.keys(errors).length) {
      editor.setFieldErrors(errors);
      return;
    }
    setCms((current) => {
      const gallery = [...(current.gallery || [])];
      const payload = {
        ...editor.draft,
        title: editor.draft.title.trim(),
        category: editor.draft.category || 'Other',
        altText: editor.draft.altText || editor.draft.title.trim() || 'Salon photo',
        sortOrder: Number(editor.draft.sortOrder || 1),
      };
      if (editor.isEditing) gallery[editor.editIndex] = { ...gallery[editor.editIndex], ...payload };
      else gallery.unshift({ ...payload, isNew: true });
      return { ...current, gallery };
    });
    editor.close();
  };

  const removeGallery = (index) => {
    setCms((current) => ({
      ...current,
      gallery: current.gallery.filter((_, itemIndex) => itemIndex !== index),
    }));
  };

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-gray-950">Gallery Photos</h2>
          <p className="mt-1 text-sm text-gray-500">Shown on the public Gallery page.</p>
        </div>
        <button onClick={editor.openCreate} className="inline-flex items-center gap-2 rounded-lg bg-gray-950 px-4 py-2 font-semibold text-white">
          <Plus className="h-4 w-4" /> Add Photo
        </button>
      </div>
      <div className="grid gap-2">
        {(cms.gallery || []).map((item, index) => (
          <CmsListRow
            key={item.id || index}
            image={item.image}
            title={item.title}
            subtitle={item.category}
            description={item.description || item.altText}
            meta={item.sortOrder ? `Order ${item.sortOrder}` : null}
            visible={item.isVisible !== false}
            onEdit={() => editor.openEdit(index, {
              ...item,
              category: item.category || 'Salon Space',
            })}
            onDelete={() => editor.setDeleteIndex(index)}
          />
        ))}
        {(cms.gallery || []).length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-200 py-10 text-center text-sm text-gray-500">No gallery photos yet.</div>
        ) : null}
      </div>

      <CmsModal
        open={Boolean(editor.draft)}
        title={editor.isEditing ? 'Edit gallery photo' : 'Add gallery photo'}
        onClose={editor.close}
        onSave={saveItem}
        saveLabel={editor.isEditing ? 'Update photo' : 'Add photo'}
      >
        <div className="grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <ImageUploadField
              label="Gallery image *"
              value={editor.draft?.image || ''}
              folder="gallery"
              onUpload={uploadImage}
              onChange={(image) => editor.patchDraft({ image })}
              error={editor.fieldErrors.image}
            />
          </div>
          <Field label="Title *" error={editor.fieldErrors.title}>
            <TextInput
              error={editor.fieldErrors.title}
              placeholder="e.g. Front seating area"
              value={editor.draft?.title || ''}
              onChange={(event) => editor.patchDraft({ title: event.target.value })}
            />
          </Field>
          <Field label="Alt text">
            <TextInput
              placeholder="e.g. Salon chairs and mirrors"
              value={editor.draft?.altText || ''}
              onChange={(event) => editor.patchDraft({ altText: event.target.value })}
            />
          </Field>
          <Field label="Category">
            <select
              value={editor.draft?.category || 'Salon Space'}
              onChange={(event) => editor.patchDraft({ category: event.target.value })}
              className={inputClass(false)}
            >
              {categoryOptions.map((category) => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>
          </Field>
          <Field label="Display order">
            <TextInput
              type="number"
              min="1"
              placeholder="e.g. 1"
              value={editor.draft?.sortOrder || 1}
              onChange={(event) => editor.patchDraft({ sortOrder: Number(event.target.value) })}
            />
          </Field>
          <div className="md:col-span-2">
            <Field label="Description">
              <TextArea
                rows={3}
                placeholder="e.g. Clean, bright space ready for walk-in clients."
                value={editor.draft?.description || ''}
                onChange={(event) => editor.patchDraft({ description: event.target.value })}
              />
            </Field>
          </div>
          <div className="md:col-span-2">
            <Toggle checked={editor.draft?.isVisible !== false} onChange={(value) => editor.patchDraft({ isVisible: value })} label="Photo" />
          </div>
        </div>
      </CmsModal>

      <ConfirmDialog
        open={editor.deleteIndex !== null}
        title="Delete gallery photo"
        description={`Remove "${cms.gallery?.[editor.deleteIndex]?.title || 'this photo'}" from the gallery? Remember to Save CMS after deleting.`}
        confirmLabel="Delete"
        destructive
        onCancel={() => editor.setDeleteIndex(null)}
        onConfirm={() => {
          removeGallery(editor.deleteIndex);
          editor.setDeleteIndex(null);
        }}
      />
    </section>
  );
}
