import { Injectable, ForbiddenException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const PDFDocument = require('pdfkit');
import { TenantsService, CreateTenantDto } from '../tenants/tenants.service';
import { AuthService } from '../auth/auth.service';
import { Role } from '../common/constants/roles';

/** Contact details shown on the pitch PDF (business pitch style). */
const PITCH_CONTACT = {
  email: 'pooprav26@gmail.com',
  phoneIndia: '+918056497843',
  phoneSingapore: '+65 94655528',
};

/** Tenant info for pitch PDF */
export interface TenantPitchInfo {
  name: string;
  slug?: string;
  subdomain?: string;
  customDomain?: string;
  isActive?: boolean;
  adminEmail?: string;
  adminName?: string;
}

@Injectable()
export class PlatformService {
  constructor(
    private tenantsService: TenantsService,
    private authService: AuthService,
  ) {}

  async createTenantWithDefaults(dto: CreateTenantDto) {
    const tenant = await this.tenantsService.create(dto.name, dto.slug, {
      subdomain: dto.subdomain,
      defaultTheme: dto.defaultTheme || 'dark',
      branding: dto.branding as Record<string, unknown> | undefined,
    });
    const tenantDoc = tenant as { _id: unknown };
    const tenantId = String(tenantDoc._id);
    if (dto.customDomain) {
      await this.tenantsService.updateTenant(tenantId, { customDomain: dto.customDomain });
    }
    await this.authService.register(
      dto.adminEmail,
      dto.adminPassword,
      tenantId,
      dto.adminName || 'Admin',
      Role.TENANT_ADMIN,
    );
    const t = tenant as { _id: unknown; toObject?: () => Record<string, unknown> };
    return { tenantId, tenant: t.toObject ? t.toObject() : t };
  }

  async resetTenantAdmin(tenantId: string, email: string, newPassword: string) {
    return this.authService.resetUserPassword(tenantId, email, newPassword);
  }

  /** Get full tenant details + admin user (email, name). Password is not stored in plain text. */
  async getTenantDetails(tenantId: string) {
    const tenant = await this.tenantsService.findById(tenantId);
    if (!tenant) return null;
    const adminUser = await this.authService.getAdminUserByTenantId(tenantId);
    const t = tenant as Record<string, unknown>;
    return {
      ...t,
      adminUser: adminUser ? { email: adminUser.email, name: adminUser.name, role: adminUser.role } : null,
    };
  }

  /**
   * Generate application pitch PDF for a tenant (dynamic content with tenant name, subdomain, etc.).
   */
  async getTenantPitchPdf(tenantId: string): Promise<{ buffer: Buffer; fileName: string }> {
    const details = await this.getTenantDetails(tenantId);
    if (!details) throw new ForbiddenException('Tenant not found');
    const t = details as Record<string, unknown>;
    const tenantName = String(t.name || 'Gym');
    const slug = t.slug != null ? String(t.slug) : tenantName.toLowerCase().replace(/\s+/g, '-');
    const subdomain = t.subdomain != null ? String(t.subdomain) : '';
    const customDomain = t.customDomain != null ? String(t.customDomain) : '';
    const adminUser = t.adminUser as { email?: string; name?: string } | null | undefined;
    const adminEmail = adminUser?.email ?? '';
    const adminName = adminUser?.name ?? '';

    const assetsDir = path.join(process.cwd(), 'src', 'platform', 'assets');
    const getBgPath = (): string | null => {
      for (const name of ['pitch-bg.jpg', 'pitch-bg.png', 'pitch-bg.jpeg']) {
        const p = path.join(assetsDir, name);
        if (fs.existsSync(p)) return p;
      }
      return null;
    };

    const buffer = await new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50 });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const PAGE_W = 595.28;
      const PAGE_H = 841.89;
      const MARGIN = 50;
      const HEADER_H = 48;
      const FOOTER_H = 40;
      const CONTENT_TOP = MARGIN + HEADER_H;
      const PAGE_BOTTOM = PAGE_H - MARGIN - FOOTER_H;
      const CONTENT_WIDTH = PAGE_W - 2 * MARGIN;

      let pageNum = 1;
      const bgPath = getBgPath();

      const drawBackground = () => {
        if (bgPath) {
          try {
            doc.image(bgPath, 0, 0, { width: PAGE_W, height: PAGE_H });
          } catch {
            doc.fillColor('#f8fafc').rect(0, 0, PAGE_W, PAGE_H).fill();
          }
        } else {
          doc.fillColor('#f8fafc').rect(0, 0, PAGE_W, PAGE_H / 2).fill();
          doc.fillColor('#f1f5f9').rect(0, PAGE_H / 2, PAGE_W, PAGE_H / 2).fill();
        }
        doc.fillColor('#000000');
      };

      const drawHeader = () => {
        doc.fillColor('#0f172a').rect(0, 0, PAGE_W, HEADER_H).fill();
        doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(14).text('Gym SaaS — Application Pitch', MARGIN, 14, { continued: false });
        doc.font('Helvetica').fontSize(10).fillColor('#94a3b8').text(tenantName, MARGIN, 30, { continued: false });
        doc.fillColor('#000000');
      };

      const drawFooter = () => {
        const footerTop = PAGE_H - FOOTER_H;
        doc.strokeColor('#e2e8f0').lineWidth(0.5).moveTo(MARGIN, footerTop).lineTo(PAGE_W - MARGIN, footerTop).stroke();
        const y = footerTop + 10;
        doc.fontSize(7).font('Helvetica').fillColor('#64748b');
        doc.text(`Contact: ${PITCH_CONTACT.email} | ${PITCH_CONTACT.phoneIndia} | ${PITCH_CONTACT.phoneSingapore}`, MARGIN, y, { width: PAGE_W - 2 * MARGIN, align: 'center', continued: false });
        doc.text(`Confidential  •  Page ${pageNum}  •  ${tenantName}`, MARGIN, y + 12, { width: PAGE_W - 2 * MARGIN, align: 'center', continued: false });
        doc.fillColor('#000000');
      };

      const title = (text: string, size = 14) => {
        doc.fontSize(size).font('Helvetica-Bold');
        const h = doc.heightOfString(text, { width: CONTENT_WIDTH });
        ensureSpace(h + 12);
        doc.x = MARGIN;
        doc.fillColor('#0f172a').text(text, { width: CONTENT_WIDTH, continued: false });
        doc.moveDown(0.4);
      };
      const para = (text: string) => {
        doc.fontSize(10).font('Helvetica');
        const fullH = doc.heightOfString(text, { width: CONTENT_WIDTH, lineGap: 2 });
        const maxH = PAGE_BOTTOM - CONTENT_TOP - 10;
        const h = Math.min(fullH, maxH);
        ensureSpace(h + 10);
        doc.x = MARGIN;
        const spaceLeft = PAGE_BOTTOM - doc.y - 5;
        const opts: { width: number; align: 'left'; lineGap: number; height?: number } = { width: CONTENT_WIDTH, align: 'left', lineGap: 2 };
        if (fullH > spaceLeft) opts.height = spaceLeft;
        doc.fillColor('#334155').text(text, opts);
        doc.moveDown(0.35);
      };
      const section = (text: string) => {
        doc.fontSize(12).font('Helvetica-Bold');
        const h = doc.heightOfString(text, { width: CONTENT_WIDTH });
        ensureSpace(h + 14);
        doc.x = MARGIN;
        doc.fillColor('#0f172a').text(text, { width: CONTENT_WIDTH, continued: false });
        doc.moveDown(0.25);
      };
      const bullet = (text: string) => {
        doc.fontSize(10).font('Helvetica');
        const h = doc.heightOfString(`• ${text}`, { width: CONTENT_WIDTH, indent: 12 });
        ensureSpace(h + 6);
        doc.x = MARGIN;
        doc.fillColor('#334155').text(`• ${text}`, { width: CONTENT_WIDTH, indent: 12 });
        doc.moveDown(0.15);
      };
      const numbered = (num: number, text: string) => {
        doc.fontSize(10).font('Helvetica');
        const h = doc.heightOfString(`${num}. ${text}`, { width: CONTENT_WIDTH, indent: 12 });
        ensureSpace(h + 6);
        doc.x = MARGIN;
        doc.fillColor('#334155').text(`${num}. ${text}`, { width: CONTENT_WIDTH, indent: 12 });
        doc.moveDown(0.15);
      };
      const tableRow = (col1: string, col2: string, col3: string, isHeader = false) => {
        const w1 = 130;
        const w2 = 175;
        const w3 = 110;
        const x2 = MARGIN + w1 + 6;
        const x3 = x2 + w2 + 6;
        doc.fontSize(isHeader ? 9 : 8).font(isHeader ? 'Helvetica-Bold' : 'Helvetica').fillColor(isHeader ? '#0f172a' : '#334155');
        const h1 = doc.heightOfString(col1, { width: w1 });
        const h2 = doc.heightOfString(col2, { width: w2 });
        const h3 = doc.heightOfString(col3, { width: w3 });
        const rowH = Math.max(h1, h2, h3) + 3;
        ensureSpace(rowH);
        const y = doc.y;
        doc.text(col1, MARGIN, y, { width: w1, continued: false });
        doc.text(col2, x2, y, { width: w2, continued: false });
        doc.text(col3, x3, y, { width: w3, continued: false });
        doc.y = y + rowH;
      };
      /** Only add a new page when needed; avoids empty pages. */
      const ensureSpace = (needed: number) => {
        if (doc.y + needed > PAGE_BOTTOM) {
          drawFooter();
          pageNum += 1;
          doc.addPage();
          drawBackground();
          drawHeader();
          doc.y = CONTENT_TOP;
          doc.x = MARGIN;
        }
      };

      drawBackground();
      drawHeader();
      doc.y = CONTENT_TOP;
      doc.x = MARGIN;

      title('Application Pitch Document', 16);
      para('Multi-tenant Gym Management Platform with AI-Powered Nutrition');
      para('Suitable for: Startup pitch • Investor/demo • Gym owner onboarding');
      doc.moveDown(0.4);

      section('Contact');
      ensureSpace(28);
      doc.x = MARGIN;
      doc.fontSize(10).font('Helvetica').fillColor('#334155');
      doc.text(`Email: ${PITCH_CONTACT.email}`, { width: CONTENT_WIDTH, continued: false });
      doc.text(`India: ${PITCH_CONTACT.phoneIndia}  •  Singapore: ${PITCH_CONTACT.phoneSingapore}`, { width: CONTENT_WIDTH, continued: false });
      doc.moveDown(0.4);

      section('Tenant (this gym)');
      para(`Name: ${tenantName}`);
      if (slug) para(`Slug: ${slug}`);
      if (subdomain) para(`Subdomain: ${subdomain}`);
      if (customDomain) para(`Custom domain: ${customDomain}`);
      if (adminEmail) para(`Admin login: ${adminEmail}`);
      if (adminName) para(`Admin name: ${adminName}`);
      doc.moveDown(0.35);

      section('Position');
      bullet('Automate member management and billing');
      bullet('Reduce administrative overhead by 60%');
      bullet('Increase revenue with integrated payment processing');
      bullet('Real-time analytics for data-driven decisions');
      bullet('One unified platform for all gym operations');

      section('The Problem — Current Gym Management Challenges');
      para('Fitness businesses today face multiple operational barriers:');
      numbered(1, 'Fragmented Systems — Member data spread across disconnected platforms');
      numbered(2, 'Manual Processes — Billing, scheduling, and member communications done manually');
      numbered(3, 'Revenue Loss — Missed payments, billing errors, and churn without predictive insights');
      numbered(4, 'Scalability Issues — Difficult to manage multiple locations or expand operations');
      numbered(5, 'Low Automation — No AI-powered marketing or member engagement tools');
      numbered(6, 'Operational Cost — High administrative burden consumes staff time');
      para('Traditional gym management systems fail to integrate core functions, leaving owners managing billing through one tool, scheduling in another, and member communications in a third. A large share of gyms report losing members due to poor communication and engagement.');

      section('The Solution — All-In-One Platform Architecture');
      para('Our SaaS platform provides gym owners with a complete operational ecosystem.');
      ensureSpace(18);
      doc.x = MARGIN;
      doc.fontSize(10).font('Helvetica-Bold').fillColor('#0f172a').text('Core Modules:', { width: CONTENT_WIDTH, continued: false });
      doc.moveDown(0.2);
      bullet('Member Management — Complete member profiles, registration, and lifecycle tracking');
      bullet('Automated Billing — Recurring payments, invoicing, and payment processing integration');
      bullet('Class Scheduling — Real-time calendar management, online booking, and capacity optimization');
      bullet('Marketing Automation — Email campaigns, SMS notifications, and targeted promotions');
      bullet('Business Analytics — Real-time dashboards, revenue tracking, and member insights');
      bullet('CRM Integration — Lead management, retention tracking, and churn prediction');
      bullet('AI-Powered Nutrition — Calorie tracking, RDI analysis, and member engagement (Indian diet–friendly)');

      section('Key Features & Benefits');
      tableRow('Feature', 'Business Benefit', 'Impact', true);
      tableRow('Cloud-Based Access', 'Manage gym from anywhere, anytime', '24/7 operational visibility');
      tableRow('Automated Payments', 'Recurring billing, payment reminders', '40% fewer missed payments');
      tableRow('Member Portal / App', 'Self-service bookings, progress tracking', 'Higher member engagement');
      tableRow('Real-Time Analytics', 'Performance metrics and insights', 'Data-driven decisions');
      tableRow('Multi-Location Support', 'Manage all gyms from one dashboard', 'Scalable growth');
      tableRow('AI-Powered Marketing', 'Targeted campaigns and retention alerts', 'Reduced churn');
      tableRow('Integrated POS', 'Merchandise, class packs, upgrades', 'Additional revenue streams');
      tableRow('Trainer Management', 'Client assignment, earnings tracking', 'Better staff coordination');
      doc.moveDown(0.2);

      section('Competitive Advantages — Why Our Solution Stands Out');
      numbered(1, 'Gym-Specific Design — Built specifically for fitness operations with industry best practices.');
      numbered(2, 'Ease of Implementation — Quick onboarding with migration tools. Minimal disruption.');
      numbered(3, 'AI-Powered Insights — Predictive analytics, at-risk members, optimal pricing.');
      numbered(4, 'Affordable Pricing — Transparent, per-location pricing that scales with your business.');
      numbered(5, 'White-Label Options — Customize the member app with your branding and logo.');
      numbered(6, '24/7 Integration Support — Payment processors, email, accounting software.');

      section('Market Opportunity — Industry Context');
      para('The global fitness management software market is experiencing rapid growth:');
      bullet('Market Size: $1.3B+ and growing ~15% annually');
      bullet('Target Audience: 400,000+ independent gyms and fitness studios globally');
      bullet('Average Gym Revenue: $250K – $1M annually per location');
      bullet('Software Spend: Gyms allocate 2–4% of revenue to software solutions');
      ensureSpace(18);
      doc.x = MARGIN;
      doc.fontSize(10).font('Helvetica-Bold').fillColor('#0f172a').text('Key Market Drivers:', { width: CONTENT_WIDTH, continued: false });
      doc.moveDown(0.2);
      bullet('Digital transformation in fitness industry');
      bullet('Member demand for mobile-first experiences');
      bullet('Gym chains seeking scalable solutions');

      section('Pricing Model — Flexible Plans for All Gym Sizes');
      ensureSpace(48);
      doc.x = MARGIN;
      doc.fontSize(10).font('Helvetica').fillColor('#334155');
      doc.text('Starter Plan: ₹999–1,499/mo — 1 location, up to 100 members', { width: CONTENT_WIDTH, indent: 12 });
      doc.text('Professional Plan: ₹2,499–3,499/mo — 2 locations, up to 500 members', { width: CONTENT_WIDTH, indent: 12 });
      doc.text('Enterprise Plan: Custom — Unlimited locations, white-label, priority support', { width: CONTENT_WIDTH, indent: 12 });
      doc.moveDown(0.3);
      doc.fontSize(10).font('Helvetica-Bold').fillColor('#0f172a').text('What\'s Included:', { width: CONTENT_WIDTH, continued: false });
      doc.moveDown(0.2);
      bullet('Unlimited member profiles');
      bullet('Automated billing and payment processing');
      bullet('Class scheduling and online booking');
      bullet('Mobile-friendly member experience');
      bullet('Nutrition AI add-on (Indian diet, RDI, analytics)');
      bullet('Regular feature updates');
      doc.moveDown(0.2);
      ensureSpace(18);
      doc.x = MARGIN;
      doc.fontSize(10).font('Helvetica-Bold').fillColor('#0f172a').text('Optional Add-Ons:', { width: CONTENT_WIDTH, continued: false });
      doc.moveDown(0.2);
      bullet('Advanced analytics and reporting');
      bullet('AI-powered marketing automation');
      bullet('Custom API integrations (quote-based)');

      section('Implementation & Support — Quick Deployment');
      ensureSpace(18);
      doc.x = MARGIN;
      doc.fontSize(10).font('Helvetica-Bold').fillColor('#0f172a').text('Phase 1: Onboarding (1 week)', { width: CONTENT_WIDTH, continued: false });
      doc.moveDown(0.12);
      para('Platform setup, data migration from existing systems, staff training.');
      doc.fontSize(10).font('Helvetica-Bold').fillColor('#0f172a').text('Phase 2: Go-Live (Week 2)', { width: CONTENT_WIDTH, continued: false });
      doc.moveDown(0.12);
      para('Member portal activation, payment integration, initial campaign setup.');
      doc.fontSize(10).font('Helvetica-Bold').fillColor('#0f172a').text('Phase 3: Optimization (Ongoing)', { width: CONTENT_WIDTH, continued: false });
      doc.moveDown(0.12);
      para('Dedicated support, quarterly reviews, feature optimization.');
      doc.moveDown(0.15);
      ensureSpace(18);
      doc.x = MARGIN;
      doc.fontSize(10).font('Helvetica-Bold').fillColor('#0f172a').text('Support:', { width: CONTENT_WIDTH, continued: false });
      doc.moveDown(0.15);
      bullet('Email support (all plans)');
      bullet('Phone support (Professional + Enterprise)');
      bullet('Knowledge base and training');

      section('Success Stories & Results — Real-World Impact');
      tableRow('Metric', 'Before', 'After', true);
      tableRow('Monthly Churn Rate', '8%', '3%');
      tableRow('Billing Accuracy', '87%', '99.5%');
      tableRow('Member Engagement', '45%', '78%');
      tableRow('Admin Time (monthly hrs)', '120 hrs', '35 hrs');
      tableRow('Revenue Growth', 'Baseline', '+32%');
      tableRow('Member Satisfaction', '3.2/5', '4.6/5');
      doc.moveDown(0.2);

      section('Why Choose Us Now — The Competitive Edge');
      numbered(1, 'Purpose-Built for Gyms — Every feature designed for fitness operations.');
      numbered(2, 'Time Savings — Reduce administrative work by 60%.');
      numbered(3, 'Revenue Growth — Decrease churn, increase automation, integrated POS.');
      numbered(4, 'Data Security — Tenant isolation, role-based access, validation.');
      numbered(5, 'No Long-Term Contracts — Month-to-month flexibility.');
      numbered(6, 'Proven Stack — NestJS, React, MongoDB, OpenAI; deployable on Render + Vercel.');

      section('Next Steps — Getting Started');
      ensureSpace(18);
      doc.x = MARGIN;
      doc.fontSize(10).font('Helvetica-Bold').fillColor('#0f172a').text('Week 1: Discovery Call', { width: CONTENT_WIDTH, continued: false });
      doc.moveDown(0.12);
      para('Understand your gym\'s needs, review current operations, customize solution fit.');
      doc.fontSize(10).font('Helvetica-Bold').fillColor('#0f172a').text('Week 2: Free Trial Access', { width: CONTENT_WIDTH, continued: false });
      doc.moveDown(0.12);
      para('Full platform access, dedicated onboarding, compare with current system.');
      doc.fontSize(10).font('Helvetica-Bold').fillColor('#0f172a').text('Week 3: Implementation', { width: CONTENT_WIDTH, continued: false });
      doc.moveDown(0.12);
      para('Choose pricing plan, schedule data migration, begin staff training.');
      doc.moveDown(0.25);
      ensureSpace(18);
      doc.x = MARGIN;
      doc.fontSize(10).font('Helvetica-Bold').fillColor('#0f172a').text('Get Started Today:', { width: CONTENT_WIDTH, continued: false });
      doc.moveDown(0.2);
      bullet('Book a free consultation');
      bullet('No credit card required for trial');

      section('Contact Information');
      ensureSpace(28);
      doc.x = MARGIN;
      doc.fontSize(10).font('Helvetica').fillColor('#334155');
      doc.text(`Email: ${PITCH_CONTACT.email}`, { width: CONTENT_WIDTH, continued: false });
      doc.text(`India: ${PITCH_CONTACT.phoneIndia}  •  Singapore: ${PITCH_CONTACT.phoneSingapore}`, { width: CONTENT_WIDTH, continued: false });
      doc.moveDown(0.4);

      section('References');
      doc.fontSize(9).font('Helvetica').fillColor('#64748b');
      para('[1] Gym Management Software Industry Report. SaaS Fitness Solutions.');
      para('[2] Member Retention and Engagement Study. Poor engagement cited as primary churn factor.');
      para('[3] Global Fitness Management Software Market. Market size $1.3B+, CAGR ~15%.');

      doc.moveDown(0.35);
      if (doc.y > PAGE_BOTTOM - 24) ensureSpace(24);
      doc.fontSize(9).font('Helvetica').fillColor('#64748b').text(`Generated for tenant: ${tenantName} — ${new Date().toISOString().slice(0, 10)}`, { width: CONTENT_WIDTH, align: 'center' });
      drawFooter();
      doc.end();
    });

    const safeName = slug.replace(/[^a-z0-9-]/gi, '-') || 'tenant';
    return { buffer, fileName: `pitch-${safeName}.pdf` };
  }
}
