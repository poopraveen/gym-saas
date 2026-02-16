import React from 'react';
import './OnboardingGuideModal.css';

/** Full application guide: tenant onboarding, user onboarding, and feature reference. Static content. */
const APP_GUIDE = [
  {
    part: '1. Application overview',
    sections: [
      {
        title: 'Roles',
        items: [
          '**Super Admin** – Platform owner. Manages tenants (gyms), creates tenants, views tenant details, resets tenant admin passwords. Access: Platform Admin screen.',
          '**Tenant Admin** – Gym owner. Full access to their gym: members, enquiries, attendance, finance, convert enquiries, mark lost.',
          '**Manager** – Same as Tenant Admin for day-to-day use (members, enquiries, attendance, finance).',
          '**Staff** – Can add/edit members and enquiries, add follow-ups. Cannot convert enquiry to member or mark lost.',
        ],
      },
      {
        title: 'Screens',
        items: [
          '**Login** – Single login page. Tenant is identified by subdomain/domain or by the user’s account.',
          '**Platform Admin** – Super Admin only. Tenant list, create tenant, tenant details, onboarding guide.',
          '**Dashboard** – After login (Tenant Admin / Manager / Staff). People, Enquiry Members, Attendance, Finance.',
        ],
      },
    ],
  },
  {
    part: '2. Tenant onboarding (Super Admin)',
    sections: [
      {
        title: 'Create a new tenant (gym)',
        items: [
          'Go to **Platform Admin** → **Create Tenant**.',
          'Enter **Business name** (e.g. gym name).',
          'Optionally set **Slug** and **Subdomain** for the tenant URL.',
          'Enter **Admin email** and **Admin password** for the gym owner.',
          'Click **Create**. Save the credentials from the popup (password is shown only once).',
        ],
      },
      {
        title: 'Share login with the tenant admin',
        items: [
          'Share the **login URL** (e.g. https://yourapp.com or tenant subdomain).',
          'Share **admin email** and **password**.',
          'They bookmark the login page and sign in to access the Dashboard.',
        ],
      },
      {
        title: 'View tenant details / Reset password',
        items: [
          'In Platform Admin, **click a tenant row** to open tenant details (name, ID, slug, subdomain, admin email).',
          'Password is not stored in plain text. Use **Reset Admin Password** to set a new password for the tenant admin.',
          'If a tenant was marked **Lost** (enquiry), you can **Mark as New** from the detail view to reopen it.',
        ],
      },
    ],
  },
  {
    part: '3. User onboarding (Dashboard users)',
    sections: [
      {
        title: 'Who uses the Dashboard',
        items: [
          '**Tenant Admin** (gym owner) – Created when the tenant is created. Uses the email/password from tenant creation.',
          '**Manager / Staff** – Additional users can be added per tenant (via your backend or future user-management screen). They use the same login URL with their own email/password.',
        ],
      },
      {
        title: 'First login',
        items: [
          'Open the **login URL** and sign in with the provided email and password.',
          'After login, the **Dashboard** opens. The sidebar shows the gym name and logo (tenant branding).',
          'Use the sidebar: **People**, **Add Member**, **Enquiry Members**, **Attendance**, **Finance**.',
        ],
      },
      {
        title: 'Logout and re-login',
        items: [
          'Use **Logout** in the sidebar. To sign in again, go to the login URL and enter email and password.',
        ],
      },
    ],
  },
  {
    part: '4. Dashboard (main screen)',
    sections: [
      {
        title: 'Dashboard tab',
        items: [
          'Shows **Total members**, **Active members**, **Fees collected**, **Pending fees**.',
          'Charts: **Fees paid vs pending**, **Monthly member growth**.',
          '**Monthly collection details** – Table and chart by month; **Download PDF** for the report.',
        ],
      },
      {
        title: 'People tab',
        items: [
          'List of all **gym members** with search, filters (All / Men / Women), status (All / Expired / Soon / Valid / New), and sort.',
          'Columns: Member name, Member ID, phone, subscription dates, status, Pay (₹) button, follow-up history.',
          '**Add Member** (➕) to register a new member (name, phone, gender, package, join date, payment).',
          'Click a row to see **member detail** on the side. **Pay fees** or open **follow-up** from there.',
          '**WhatsApp** icon next to phone opens follow-up modal (comment + next follow-up date).',
          'Table is **paginated** (10/20/50/100 per page).',
        ],
      },
      {
        title: 'Enquiry Members tab',
        items: [
          '**Enquiry Members** – People who enquired but have not joined yet.',
          '**Add Enquiry** – Name, phone, email, enquiry date, source (Walk-in / Phone / Website / Referral / Social Media), notes, expected join date, assigned trainer.',
          'List: Name, contact (phone + **WhatsApp**), enquiry date, expected date, follow-up info, status (New / Follow-up / Converted / Lost). **View**, **Edit**, **F/U**, **Convert**, **Lost**.',
          '**WhatsApp** next to phone opens follow-up modal with type pre-set to WhatsApp.',
          '**Convert** – Opens form prefilled from enquiry; complete membership details and create member. Enquiry status becomes Converted.',
          '**Mark as Lost** – For not interested. In detail view, **Mark as New** to reopen.',
          'Filters: **Follow-up Today**, **Overdue**, **New (24h)**. Rows highlight (yellow/orange for today, red for overdue).',
        ],
      },
      {
        title: 'Attendance tab',
        items: [
          '**Check-in** – Enter **Registration No** and click **Check In** to record today’s attendance.',
          'List below shows who checked in today.',
        ],
      },
      {
        title: 'Finance tab',
        items: [
          'Cards: **This month**, **Overall**, **Total members**.',
          '**Monthly collection details** – Chart and table; **Download PDF** for the report.',
        ],
      },
    ],
  },
  {
    part: '5. Pay fees & dates',
    sections: [
      {
        title: 'Pay fees (from People)',
        items: [
          'Click the **₹** button on a member row or **Pay fees** in the member detail.',
          'Choose **package type** (e.g. Gendral / Cardio), **duration** (1/3/6/12 months). Amount updates automatically.',
          '**Start from current date** – Due date = today + duration. Uncheck to extend from existing due date.',
          '**New due date** – Editable; only today or past dates allowed (future disabled).',
          'Add optional comment (e.g. Receipt ID) and click **Update fees**.',
        ],
      },
      {
        title: 'Date rules in the app',
        items: [
          '**Date of joining** (Add Member / Convert) – Only today or past (future disabled).',
          '**Enquiry date** – Only today or past.',
          '**New due date** (Pay fees) – Only today or past.',
        ],
      },
    ],
  },
  {
    part: '6. Tenant branding',
    sections: [
      {
        title: 'After login',
        items: [
          'The **sidebar and header** show the **tenant name** and **logo** (if set) for the logged-in tenant.',
          'This is loaded automatically by tenant; no manual configuration on the dashboard.',
        ],
      },
    ],
  },
];

export default function OnboardingGuideModal({ onClose }: { onClose: () => void }) {
  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="onboarding-modal-overlay" onClick={onClose}>
      <div className="onboarding-modal no-print" onClick={(e) => e.stopPropagation()}>
        <div className="onboarding-modal-header no-print">
          <h2>Application guide – Tenant & user onboarding</h2>
          <div className="onboarding-modal-actions">
            <button type="button" className="btn-secondary" onClick={handlePrint}>
              Print / Save as PDF
            </button>
            <button type="button" className="btn-primary" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
        <div className="onboarding-modal-body">
          <div className="onboarding-doc">
            <h2 className="onboarding-print-title">Application guide – Tenant & user onboarding</h2>
            <p className="onboarding-intro">
              Full application reference: tenant onboarding, user onboarding, and all features. Static guide for Super Admins and support.
            </p>
            {APP_GUIDE.map((part, pIdx) => (
              <div key={pIdx} className="onboarding-part">
                <h2 className="onboarding-part-title">{part.part}</h2>
                {part.sections.map((section, sIdx) => (
                  <section key={sIdx} className="onboarding-section">
                    <h3>{section.title}</h3>
                    <ol>
                      {section.items.map((item, i) => (
                        <li
                          key={i}
                          dangerouslySetInnerHTML={{
                            __html: item.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>'),
                          }}
                        />
                      ))}
                    </ol>
                  </section>
                ))}
              </div>
            ))}
            <p className="onboarding-footer">
              For support, refer to your deployment documentation or contact your system administrator.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
