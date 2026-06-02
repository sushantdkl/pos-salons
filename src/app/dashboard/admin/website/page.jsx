'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import DashboardLayout from '@/components/layout/dashboard-layout';
import { Eye, Plus, Save, Trash2 } from 'lucide-react';

const tabs = ['Hero', 'About', 'Services', 'Packages', 'Staff', 'Gallery', 'Contact', 'SEO'];
const sectionMap = {
  Hero: 'hero',
  About: 'about',
  Contact: 'contact',
  SEO: 'seo',
};
const categories = ['Haircut', 'Hair Color', 'Facial', 'Beard', 'Treatment', 'Makeup', 'Spa', 'Other'];

function headers() {
  return {
    Authorization: `Bearer ${localStorage.getItem('pos_token')}`,
    'Content-Type': 'application/json',
  };
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-semibold text-gray-900">{label}</span>
      {children}
    </label>
  );
}

function TextInput(props) {
  return <input {...props} className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-950 outline-none focus:ring-2 focus:ring-gray-900" />;
}

function TextArea(props) {
  return <textarea {...props} className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-950 outline-none focus:ring-2 focus:ring-gray-900" />;
}

function Toggle({ checked, onChange, label }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`rounded-full px-4 py-2 text-sm font-semibold ${checked ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}
    >
      {label}: {checked ? 'Shown' : 'Hidden'}
    </button>
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
      [listKey]: current[listKey].map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item),
    }));
  };

  const save = async () => {
    setSaving(true);
    setMessage('');
    setError('');
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
      setError(data.error || 'Could not save website CMS');
    }
    setSaving(false);
  };

  const activeSection = useMemo(() => cms?.sections?.[sectionMap[activeTab]], [activeTab, cms]);

  if (loading) {
    return <DashboardLayout><div className="min-h-screen bg-gray-50 p-6 text-gray-600">Loading Website CMS...</div></DashboardLayout>;
  }

  if (!cms) {
    return <DashboardLayout><div className="min-h-screen bg-gray-50 p-6 text-red-700">{error || 'Website CMS unavailable.'}</div></DashboardLayout>;
  }

  return (
    <DashboardLayout>
      <div className="min-h-screen bg-gray-50 p-4 sm:p-6">
        <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-3xl font-semibold text-gray-950">Website CMS</h1>
            <p className="mt-1 text-sm text-gray-600">Manage public website content without editing source code.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/" target="_blank" className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-3 font-semibold text-gray-700">
              <Eye className="h-4 w-4" /> Preview Website
            </Link>
            <button onClick={save} disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-gray-950 px-5 py-3 font-semibold text-white disabled:opacity-60">
              <Save className="h-4 w-4" /> {saving ? 'Saving...' : 'Save CMS'}
            </button>
          </div>
        </div>

        {message ? <div className="mb-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm font-semibold text-green-700">{message}</div> : null}
        {error ? <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</div> : null}

        <div className="mb-5 flex gap-2 overflow-x-auto rounded-lg border border-gray-200 bg-white p-2">
          {tabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`shrink-0 rounded-md px-4 py-2 text-sm font-semibold ${activeTab === tab ? 'bg-gray-950 text-white' : 'text-gray-700 hover:bg-gray-100'}`}
            >
              {tab}
            </button>
          ))}
        </div>

        {activeSection ? (
          <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-gray-950">{activeTab} Section</h2>
              <Toggle checked={activeSection.isVisible} onChange={(value) => updateSection(activeSection.sectionKey, { isVisible: value })} label="Section" />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Title"><TextInput value={activeSection.title || ''} onChange={(event) => updateSection(activeSection.sectionKey, { title: event.target.value })} /></Field>
              <Field label="Subtitle / Eyebrow"><TextInput value={activeSection.subtitle || ''} onChange={(event) => updateSection(activeSection.sectionKey, { subtitle: event.target.value })} /></Field>
              <Field label="Image URL"><TextInput value={activeSection.imageUrl || ''} onChange={(event) => updateSection(activeSection.sectionKey, { imageUrl: event.target.value })} placeholder="/assets/example.jpg" /></Field>
              <Field label="Primary CTA Text"><TextInput value={activeSection.buttonText || ''} onChange={(event) => updateSection(activeSection.sectionKey, { buttonText: event.target.value })} /></Field>
              <Field label="Primary CTA Link"><TextInput value={activeSection.buttonLink || ''} onChange={(event) => updateSection(activeSection.sectionKey, { buttonLink: event.target.value })} /></Field>
              <Field label="Secondary CTA Text"><TextInput value={activeSection.secondaryButtonText || ''} onChange={(event) => updateSection(activeSection.sectionKey, { secondaryButtonText: event.target.value })} /></Field>
              <Field label="Secondary CTA Link"><TextInput value={activeSection.secondaryButtonLink || ''} onChange={(event) => updateSection(activeSection.sectionKey, { secondaryButtonLink: event.target.value })} /></Field>
              <Field label="Description"><TextArea rows={5} value={activeSection.description || ''} onChange={(event) => updateSection(activeSection.sectionKey, { description: event.target.value })} /></Field>
            </div>
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
                    <TextInput value={activeSection.metadata?.[key] || ''} onChange={(event) => updateSectionMetadata('contact', { [key]: event.target.value })} />
                  </Field>
                ))}
                <div className="md:col-span-2">
                  <Field label="Google Map Embed URL or iframe">
                    <TextArea rows={4} value={activeSection.metadata?.mapEmbedUrl || ''} onChange={(event) => updateSectionMetadata('contact', { mapEmbedUrl: event.target.value })} />
                  </Field>
                </div>
              </div>
            ) : null}
            {activeTab === 'SEO' ? (
              <div className="mt-6 grid gap-4 md:grid-cols-2">
                <Field label="Open Graph Title"><TextInput value={activeSection.metadata?.ogTitle || ''} onChange={(event) => updateSectionMetadata('seo', { ogTitle: event.target.value })} /></Field>
                <Field label="Open Graph Description"><TextArea rows={3} value={activeSection.metadata?.ogDescription || ''} onChange={(event) => updateSectionMetadata('seo', { ogDescription: event.target.value })} /></Field>
                <Field label="Keywords"><TextInput value={activeSection.metadata?.keywords || ''} onChange={(event) => updateSectionMetadata('seo', { keywords: event.target.value })} /></Field>
              </div>
            ) : null}
          </section>
        ) : null}

        {activeTab === 'Services' ? <ServiceEditor cms={cms} updateList={updateList} /> : null}
        {activeTab === 'Packages' ? <PackageEditor cms={cms} updateList={updateList} /> : null}
        {activeTab === 'Staff' ? <StaffEditor cms={cms} updateList={updateList} /> : null}
        {activeTab === 'Gallery' ? <GalleryEditor cms={cms} setCms={setCms} /> : null}
      </div>
    </DashboardLayout>
  );
}

function ServiceEditor({ cms, updateList }) {
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="mb-4 text-xl font-semibold text-gray-950">Website Services</h2>
      <div className="grid gap-4">
        {cms.services.map((service, index) => (
          <div key={service.id || service.name} className="grid gap-3 rounded-lg border border-gray-200 p-4 md:grid-cols-4">
            <Field label="Name"><TextInput value={service.name || ''} onChange={(event) => updateList('services', index, { name: event.target.value })} /></Field>
            <Field label="Category">
              <select value={service.serviceCategory || 'Haircut'} onChange={(event) => updateList('services', index, { serviceCategory: event.target.value })} className="w-full rounded-lg border border-gray-300 px-4 py-3">
                {categories.map((category) => <option key={category} value={category}>{category}</option>)}
              </select>
            </Field>
            <Field label="Price"><TextInput type="number" min="0" value={service.price || 0} onChange={(event) => updateList('services', index, { price: Number(event.target.value) })} /></Field>
            <Field label="Duration"><TextInput type="number" min="1" value={service.duration || 30} onChange={(event) => updateList('services', index, { duration: Number(event.target.value) })} /></Field>
            <div className="md:col-span-2"><Field label="Website Description"><TextArea rows={3} value={service.description || ''} onChange={(event) => updateList('services', index, { description: event.target.value, websiteDescription: event.target.value })} /></Field></div>
            <div className="md:col-span-2"><Field label="Website Image URL"><TextInput value={service.image || ''} onChange={(event) => updateList('services', index, { image: event.target.value })} /></Field></div>
            <div className="flex gap-2 md:col-span-4">
              <Toggle checked={service.showOnWebsite !== false} onChange={(value) => updateList('services', index, { showOnWebsite: value })} label="Website" />
              <button type="button" onClick={() => updateList('services', index, { featured: !service.featured })} className={`rounded-full px-4 py-2 text-sm font-semibold ${service.featured ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-600'}`}>Featured: {service.featured ? 'Yes' : 'No'}</button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function PackageEditor({ cms, updateList }) {
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="mb-4 text-xl font-semibold text-gray-950">Website Packages</h2>
      <div className="grid gap-4">
        {cms.packages.map((item, index) => (
          <div key={item.id || item.name} className="grid gap-3 rounded-lg border border-gray-200 p-4 md:grid-cols-3">
            <Field label="Package Name"><TextInput value={item.name || ''} onChange={(event) => updateList('packages', index, { name: event.target.value, isPackage: true, category: 'Other' })} /></Field>
            <Field label="Price"><TextInput type="number" min="0" value={item.price || 0} onChange={(event) => updateList('packages', index, { price: Number(event.target.value), isPackage: true, category: 'Other' })} /></Field>
            <Field label="Image URL"><TextInput value={item.image || ''} onChange={(event) => updateList('packages', index, { image: event.target.value, isPackage: true, category: 'Other' })} /></Field>
            <div className="md:col-span-3"><Field label="Description"><TextArea rows={3} value={item.description || ''} onChange={(event) => updateList('packages', index, { description: event.target.value, websiteDescription: event.target.value, isPackage: true, category: 'Other' })} /></Field></div>
            <div className="md:col-span-3"><Field label="Included Services"><TextInput value={(item.includes || []).join(', ')} onChange={(event) => updateList('packages', index, { includes: event.target.value.split(',').map((value) => value.trim()).filter(Boolean), isPackage: true, category: 'Other' })} /></Field></div>
            <div className="flex gap-2 md:col-span-3">
              <Toggle checked={item.showOnWebsite !== false} onChange={(value) => updateList('packages', index, { showOnWebsite: value, isPackage: true, category: 'Other' })} label="Website" />
              <button type="button" onClick={() => updateList('packages', index, { featured: !item.featured, isPackage: true, category: 'Other' })} className={`rounded-full px-4 py-2 text-sm font-semibold ${item.featured ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-600'}`}>Featured: {item.featured ? 'Yes' : 'No'}</button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function StaffEditor({ cms, updateList }) {
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="mb-4 text-xl font-semibold text-gray-950">Website Staff</h2>
      <div className="grid gap-4">
        {cms.staff.map((member, index) => (
          <div key={member.id || member.name} className="grid gap-3 rounded-lg border border-gray-200 p-4 md:grid-cols-3">
            <Field label="Display Name"><TextInput value={member.name || ''} onChange={(event) => updateList('staff', index, { name: event.target.value })} /></Field>
            <Field label="Role / Title"><TextInput value={member.role || ''} onChange={(event) => updateList('staff', index, { role: event.target.value })} /></Field>
            <Field label="Photo URL"><TextInput value={member.image || ''} onChange={(event) => updateList('staff', index, { image: event.target.value })} /></Field>
            <div className="md:col-span-3"><Field label="Bio"><TextArea rows={3} value={member.bio || ''} onChange={(event) => updateList('staff', index, { bio: event.target.value })} /></Field></div>
            <div className="flex gap-2 md:col-span-3">
              <Toggle checked={member.showOnWebsite !== false} onChange={(value) => updateList('staff', index, { showOnWebsite: value })} label="Website" />
              <button type="button" onClick={() => updateList('staff', index, { featured: !member.featured })} className={`rounded-full px-4 py-2 text-sm font-semibold ${member.featured ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-600'}`}>Featured: {member.featured ? 'Yes' : 'No'}</button>
            </div>
          </div>
        ))}
      </div>
      <p className="mt-4 text-sm text-gray-500">Private staff data such as PIN, phone, salary, commission, and performance is never shown here.</p>
    </section>
  );
}

function GalleryEditor({ cms, setCms }) {
  const updateGallery = (index, patch) => {
    setCms((current) => ({
      ...current,
      gallery: current.gallery.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item),
    }));
  };

  const addGallery = () => {
    setCms((current) => ({
      ...current,
      gallery: [...current.gallery, { image: '', title: 'New photo', altText: 'Salon photo', category: '', description: '', sortOrder: current.gallery.length + 1, isVisible: true }],
    }));
  };

  const removeGallery = (index) => {
    setCms((current) => ({
      ...current,
      gallery: current.gallery.filter((_, itemIndex) => itemIndex !== index),
    }));
  };

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-950">Gallery Photos</h2>
        <button onClick={addGallery} className="inline-flex items-center gap-2 rounded-lg bg-gray-950 px-4 py-2 font-semibold text-white"><Plus className="h-4 w-4" />Add Photo</button>
      </div>
      <div className="grid gap-4">
        {cms.gallery.map((item, index) => (
          <div key={item.id || index} className="grid gap-3 rounded-lg border border-gray-200 p-4 md:grid-cols-4">
            <Field label="Image URL"><TextInput value={item.image || ''} onChange={(event) => updateGallery(index, { image: event.target.value })} /></Field>
            <Field label="Title"><TextInput value={item.title || ''} onChange={(event) => updateGallery(index, { title: event.target.value })} /></Field>
            <Field label="Alt Text"><TextInput value={item.altText || ''} onChange={(event) => updateGallery(index, { altText: event.target.value })} /></Field>
            <Field label="Category"><TextInput value={item.category || ''} onChange={(event) => updateGallery(index, { category: event.target.value })} /></Field>
            <div className="md:col-span-2"><Field label="Description"><TextArea rows={3} value={item.description || ''} onChange={(event) => updateGallery(index, { description: event.target.value })} /></Field></div>
            <Field label="Display Order"><TextInput type="number" min="1" value={item.sortOrder || index + 1} onChange={(event) => updateGallery(index, { sortOrder: Number(event.target.value) })} /></Field>
            <div className="flex items-end gap-2">
              <Toggle checked={item.isVisible !== false} onChange={(value) => updateGallery(index, { isVisible: value })} label="Photo" />
              <button onClick={() => removeGallery(index)} className="rounded-lg border border-red-200 px-3 py-2 text-red-700"><Trash2 className="h-4 w-4" /></button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
