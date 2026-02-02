import { driver, type DriveStep } from 'driver.js';
import 'driver.js/dist/driver.css';
import './guidedTourTheme.css';

const commonConfig = {
  showProgress: true,
  allowClose: true,
  nextBtnText: 'Next',
  prevBtnText: 'Back',
  doneBtnText: 'Done',
};

/** FTUX tour for Super Admin on Platform Admin page */
export function runPlatformTour(): void {
  const steps: DriveStep[] = [
    {
      element: 'body',
      popover: {
        title: 'Welcome to Platform Admin',
        description: 'This short tour will show you the main areas: onboarding guide, creating tenants, and the tenant list.',
        side: 'bottom',
        align: 'center',
      },
    },
    {
      element: '[data-tour="platform-onboarding-guide"]',
      popover: {
        title: 'Onboarding guide',
        description: 'Open the full application guide (tenant & user onboarding, features). You can print or save it as PDF.',
        side: 'bottom',
      },
    },
    {
      element: '[data-tour="platform-create-tenant"]',
      popover: {
        title: 'Create Tenant',
        description: 'Add a new gym (tenant). Enter business name, optional slug/subdomain, and admin email & password. Share the credentials with the gym owner.',
        side: 'bottom',
      },
    },
    {
      element: '[data-tour="platform-tenants-table"]',
      popover: {
        title: 'Tenants list',
        description: 'All your tenants (gyms). Click a row to see details, reset admin password, or mark enquiry as new.',
        side: 'top',
      },
    },
    {
      element: '[data-tour="platform-go-dashboard"]',
      popover: {
        title: 'Go to Dashboard',
        description: 'Switch to the tenant dashboard (members, enquiries, attendance, finance).',
        side: 'left',
      },
    },
    {
      element: 'body',
      popover: {
        title: 'Tour complete',
        description: 'You can start this tour again anytime using the "Take a tour" button.',
        side: 'bottom',
        align: 'center',
      },
    },
  ];

  const driverObj = driver({
    ...commonConfig,
    steps,
  });
  driverObj.drive();
}

/** FTUX tour for tenant users on Dashboard: nav + People (search, filters, list, add member) */
export function runDashboardTour(): void {
  const steps: DriveStep[] = [
    {
      element: 'body',
      popover: {
        title: 'Dashboard tour',
        description: 'This tour covers all screens: People (search, filters, list), Add Member, Enquiry Members, Attendance, Finance, and theme.',
        side: 'bottom',
        align: 'center',
      },
    },
    {
      element: '[data-tour="nav-dashboard"]',
      popover: {
        title: 'Dashboard',
        description: 'Overview: total members, active members, fees collected, pending fees, and monthly reports. Download PDF from here.',
        side: 'right',
      },
    },
    {
      element: '[data-tour="nav-main"]',
      popover: {
        title: 'People',
        description: 'Your gym members. Use search, filters, and the list below. Click a row for details, pay fees, or follow-up.',
        side: 'right',
      },
    },
    {
      element: '[data-tour="people-search"]',
      popover: {
        title: 'Search',
        description: 'Search by name, phone, Reg No, or Member ID. Results update as you type.',
        side: 'bottom',
      },
    },
    {
      element: '[data-tour="people-filter-status"]',
      popover: {
        title: 'Status filters',
        description: 'Filter by membership status: All, Expired, Soon (expiring in 30 days), Valid, or New (joined in last 30 days).',
        side: 'bottom',
      },
    },
    {
      element: '[data-tour="people-filter-gender"]',
      popover: {
        title: 'Gender filters',
        description: 'Show All members, or only Men or Women.',
        side: 'bottom',
      },
    },
    {
      element: '[data-tour="people-sort"]',
      popover: {
        title: 'Sort',
        description: 'Sort the list by status: Expired first, Soon first, Valid first, or New first.',
        side: 'bottom',
      },
    },
    {
      element: '[data-tour="people-list"]',
      popover: {
        title: 'Members list',
        description: 'All members matching your filters. Each row shows name, phone, subscription dates, and status.',
        side: 'top',
      },
    },
    {
      element: '[data-tour="people-first-row"]',
      popover: {
        title: 'First record',
        description: 'Click any row to open details: pay fees, add follow-up, or WhatsApp. This row is an example of the data.',
        side: 'top',
      },
    },
    {
      element: '[data-tour="people-add-member"]',
      popover: {
        title: 'New member',
        description: 'Add a new member: name, phone, gender, package, join date, and payment. Opens the Add Member form.',
        side: 'left',
      },
    },
    {
      element: '[data-tour="nav-add"]',
      popover: {
        title: 'Add Member (sidebar)',
        description: 'Same as the + button: register a new member from the sidebar anytime.',
        side: 'right',
      },
    },
    {
      element: '[data-tour="nav-enquiries"]',
      popover: {
        title: 'Enquiry Members',
        description: 'People who enquired but haven’t joined. Add enquiries, follow up, convert to member, or mark as lost.',
        side: 'right',
      },
    },
    {
      element: '[data-tour="nav-checkin"]',
      popover: {
        title: 'Attendance',
        description: 'Check-in: enter registration number to record today’s attendance.',
        side: 'right',
      },
    },
    {
      element: '[data-tour="nav-finance"]',
      popover: {
        title: 'Finance',
        description: 'Finance summary and monthly collection details. Download PDF reports.',
        side: 'right',
      },
    },
    {
      element: '[data-tour="theme-toggle"]',
      popover: {
        title: 'Theme',
        description: 'Switch between light and dark mode.',
        side: 'right',
      },
    },
    {
      element: 'body',
      popover: {
        title: 'Tour complete',
        description: 'You can replay this tour anytime using the "Guide" button in the sidebar.',
        side: 'bottom',
        align: 'center',
      },
    },
  ];

  const driverObj = driver({
    ...commonConfig,
    steps,
  });
  driverObj.drive();
}

/** FTUX tour for Enquiry Members screen: search, filters, table, add enquiry */
export function runEnquiriesTour(): void {
  const steps: DriveStep[] = [
    {
      element: 'body',
      popover: {
        title: 'Enquiry Members tour',
        description: 'This tour covers search, filters, the enquiries table, and adding new enquiries.',
        side: 'bottom',
        align: 'center',
      },
    },
    {
      element: '[data-tour="nav-enquiries"]',
      popover: {
        title: 'Enquiry Members',
        description: 'You are here. All leads who enquired but haven’t joined yet.',
        side: 'right',
      },
    },
    {
      element: '[data-tour="enquiries-search"]',
      popover: {
        title: 'Search',
        description: 'Search by name, phone, or email. Results update as you type.',
        side: 'bottom',
      },
    },
    {
      element: '[data-tour="enquiries-quick-filters"]',
      popover: {
        title: 'Quick filters',
        description: 'All, Follow-up Today, Overdue, or New (24h). Rows highlight in yellow/orange for today, red for overdue.',
        side: 'bottom',
      },
    },
    {
      element: '[data-tour="enquiries-status-filter"]',
      popover: {
        title: 'Status filter',
        description: 'Filter by status: New, Follow-up, Converted, or Lost.',
        side: 'bottom',
      },
    },
    {
      element: '[data-tour="enquiries-list"]',
      popover: {
        title: 'Enquiries table',
        description: 'Each row shows name, contact, enquiry date, expected join date, follow-up info, and status.',
        side: 'top',
      },
    },
    {
      element: '[data-tour="enquiries-first-row"]',
      popover: {
        title: 'First record',
        description: 'Click a row to view details. Use View, Edit, F/U (follow-up), Convert to member, or Mark as Lost.',
        side: 'top',
      },
    },
    {
      element: '[data-tour="enquiries-add"]',
      popover: {
        title: 'New enquiry',
        description: 'Add a new enquiry: name, phone, email, source (Walk-in, Phone, Website, etc.), notes, and expected join date.',
        side: 'left',
      },
    },
    {
      element: '[data-tour="nav-main"]',
      popover: {
        title: 'People',
        description: 'Switch to gym members: search, filter, pay fees, add follow-ups.',
        side: 'right',
      },
    },
    {
      element: '[data-tour="nav-dashboard"]',
      popover: {
        title: 'Dashboard',
        description: 'Overview: totals, charts, and monthly reports.',
        side: 'right',
      },
    },
    {
      element: '[data-tour="theme-toggle"]',
      popover: {
        title: 'Theme',
        description: 'Switch between light and dark mode.',
        side: 'right',
      },
    },
    {
      element: 'body',
      popover: {
        title: 'Tour complete',
        description: 'Replay this tour anytime using the "Guide" button in the sidebar.',
        side: 'bottom',
        align: 'center',
      },
    },
  ];

  const driverObj = driver({
    ...commonConfig,
    steps,
  });
  driverObj.drive();
}
