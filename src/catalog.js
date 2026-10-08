/**
 * What the palette knows how to reach.
 *
 * Two kinds of thing live here:
 *
 * - CATEGORIES — a metadata type you drill *into*. Selecting "Permission Sets"
 *   lists the org's actual permission sets, not a Setup landing page.
 * - SETUP_PAGES — plain Setup destinations with no record list behind them.
 *   No API call, so these are searchable on the first keystroke.
 */

import { TYPE } from './pathModel.js';

/**
 * Drill-down categories.
 *
 * Data-driven rather than one module per type: most of them differ only in
 * which object to query and which fields to show. `mapper` names the few that
 * genuinely need custom handling.
 *
 * @property source          background data-source key
 * @property setupNode       Setup node, used for the "Open Setup page" row and
 *                           for each record's detail URL
 * @property federate        include these records in the root search?
 * @property shadowsObjects  EntityDefinition API names this category supersedes;
 *                           their Object Manager rows get pushed below it
 * @property mapper          'record' (field-driven) or a custom mapper name
 */
export const CATEGORIES = [
  {
    value: 'object',
    label: 'Objects',
    keywords: ['object', 'sobject', 'schema', 'object manager'],
    source: 'objects',
    setupNode: 'ObjectManager',
    setupLabel: 'Object Manager',
    federate: true,
    mapper: 'objects'
  },
  {
    value: 'apex',
    label: 'Apex Classes',
    keywords: ['apex', 'class', 'code'],
    source: 'apex',
    setupNode: 'ApexClasses',
    federate: true,
    mapper: 'apex'
  },
  {
    value: 'trigger',
    label: 'Apex Triggers',
    keywords: ['trigger', 'trg'],
    source: 'triggers',
    setupNode: 'ApexTriggers',
    federate: true,
    mapper: 'triggers'
  },
  {
    value: 'flow',
    label: 'Flows',
    keywords: ['flow', 'automation', 'process builder'],
    source: 'flows',
    setupNode: 'Flows',
    federate: true,
    // NOT 'Flow' — no object by that name exists. The object whose *label* is
    // "Flow" is `FlowRecord`, which is exactly what made typing "flow" open
    // Object Manager instead of listing flows. Verified against the org.
    shadowsObjects: ['FlowRecord', 'FlowDefinitionView', 'FlowVersionView'],
    mapper: 'flows'
  },
  {
    value: 'permset',
    label: 'Permission Sets',
    keywords: ['permission set', 'permset', 'ps', 'permission'],
    source: 'permissionSets',
    setupNode: 'PermSets',
    federate: true,
    shadowsObjects: ['PermissionSet'],
    badge: 'PERMSET',
    fields: { label: 'Label', sublabel: 'Name' }
  },
  {
    value: 'permsetgroup',
    label: 'Permission Set Groups',
    keywords: ['permission set group', 'psg', 'permset group'],
    source: 'permissionSetGroups',
    setupNode: 'PermSetGroups',
    federate: true,
    shadowsObjects: ['PermissionSetGroup'],
    badge: 'PSGROUP',
    fields: { label: 'MasterLabel', sublabel: 'DeveloperName' }
  },
  {
    value: 'profile',
    label: 'Profiles',
    keywords: ['profile'],
    source: 'profiles',
    setupNode: 'EnhancedProfiles',
    federate: true,
    shadowsObjects: ['Profile'],
    badge: 'PROFILE',
    fields: { label: 'Name' }
  },
  {
    value: 'role',
    label: 'Roles',
    keywords: ['role', 'hierarchy', 'user role'],
    source: 'roles',
    setupNode: 'Roles',
    federate: true,
    shadowsObjects: ['UserRole'],
    badge: 'ROLE',
    fields: { label: 'Name' }
  },
  {
    value: 'user',
    label: 'Users',
    keywords: ['user', 'people', 'login as'],
    source: 'users',
    setupNode: 'ManageUsers',
    federate: false,
    shadowsObjects: ['User'],
    badge: 'USER',
    fields: { label: 'Name', sublabel: 'Username' },
    // Users are the one category that is org *data* rather than org
    // configuration: every other source tops out at a few thousand rows, but an
    // org can hold a hundred thousand users. Downloading that is neither fast
    // nor bounded, so users are searched on the server and never cached.
    //
    // The cost is that "user >" cannot list everyone — it asks you to type.
    search: true,
    sosl: {
      object: 'User',
      fields: 'Id, Name, Username',
      where: 'IsActive = true',
      orderBy: 'Name'
    }
  }
];

export const CATEGORY_BY_VALUE = new Map(CATEGORIES.map((category) => [category.value, category]));

/** Object API names that a category supersedes, so Object Manager ranks below it. */
export const SHADOWED_OBJECTS = new Set(CATEGORIES.flatMap((category) => category.shadowsObjects || []));

/** Category rows for the root list. Non-terminal — selecting one drills in. */
export const CATEGORY_CANDIDATES = CATEGORIES.map((category) => ({
  id: `scope:${category.value}`,
  type: TYPE.SCOPE,
  value: category.value,
  label: category.label,
  sublabel: 'Browse all',
  badge: 'BROWSE',
  keywords: category.keywords
}));

const CATEGORY_NODES = new Set(CATEGORIES.map((category) => category.setupNode));

const ROUTES = [
  // — Code —
  ['Apex Test Execution', 'ApexTestQueue', ['test', 'run tests', 'apex test']],
  ['Apex Jobs', 'AsyncApexJobs', ['job', 'batch', 'queueable', 'async']],
  ['Apex Execution (Anonymous)', 'ApexExecution', ['anonymous', 'execute', 'dev console']],
  ['Debug Logs', 'ApexDebugLogs', ['log', 'debug', 'trace']],
  ['Visualforce Pages', 'ApexPages', ['vf', 'visualforce', 'page']],
  ['Visualforce Components', 'ApexComponent', ['vf component']],
  ['Lightning Components', 'LightningComponentBundles', ['lwc', 'aura', 'component']],
  ['Static Resources', 'StaticResources', ['resource', 'zip', 'asset']],
  ['Custom Metadata Types', 'CustomMetadata', ['cmdt', 'custom metadata']],
  ['Custom Settings', 'CustomSettings', ['setting', 'hierarchy setting']],
  ['Custom Labels', 'ExternalStrings', ['label', 'translation', 'string']],
  ['Platform Events', 'EventObjects', ['event', 'pe']],
  ['Remote Site Settings', 'SecurityRemoteProxy', ['remote site', 'callout']],
  ['Named Credentials', 'NamedCredential', ['named credential', 'callout', 'auth']],
  ['Auth. Providers', 'AuthProviders', ['auth provider', 'sso']],
  ['Connected Apps', 'ConnectedApplication', ['connected app', 'oauth']],

  // — Automation —
  ['Process Automation Settings', 'ProcessAutomation', ['process settings']],
  ['Workflow Rules', 'WorkflowRules', ['workflow', 'wf']],
  ['Email Alerts', 'WorkflowEmails', ['email alert']],
  ['Field Updates', 'WorkflowFieldUpdates', ['field update']],
  ['Approval Processes', 'ApprovalProcesses', ['approval']],
  ['Scheduled Jobs', 'ScheduledJobs', ['schedule', 'cron']],
  ['Queues', 'Queues', ['queue']],
  ['Assignment Rules (Case)', 'CaseRules', ['assignment rule', 'case rule']],
  ['Einstein Bots', 'EinsteinBots', ['bot', 'agentforce', 'einstein']],

  // — Objects & data —
  ['Schema Builder', 'SchemaBuilder', ['schema', 'erd', 'diagram']],
  ['Data Import Wizard', 'DataManagementDataImporter', ['import', 'load data']],
  ['Data Export', 'DataManagementExport', ['export', 'backup']],
  ['Mass Delete Records', 'DataManagementMassDelete', ['mass delete', 'purge']],
  ['Storage Usage', 'CompanyResourceDisk', ['storage', 'usage', 'disk']],
  ['Picklist Value Sets', 'Picklists', ['picklist', 'global value set', 'gvs']],
  ['Tabs', 'CustomTabs', ['tab']],
  ['Record Types', 'RecordTypes', ['record type', 'rt']],

  // — Users & security —
  ['Public Groups', 'PublicGroups', ['group']],
  ['Sharing Settings', 'SecuritySharing', ['sharing', 'owd', 'org wide default']],
  ['Field Accessibility', 'FieldAccessibility', ['fls', 'field level security']],
  ['Login History', 'OrgLoginHistory', ['login history', 'audit login']],
  ['Setup Audit Trail', 'SecurityEvents', ['audit trail', 'who changed']],
  ['Session Settings', 'SecuritySession', ['session', 'timeout']],
  ['Password Policies', 'SecurityPolicies', ['password policy']],
  ['Login Access Policies', 'LoginAccessPolicies', ['login access', 'grant access']],
  ['Certificate and Key Management', 'CertificatesAndKeysManagement', ['certificate', 'cert', 'key']],

  // — Deployment & release —
  ['Deployment Status', 'DeployStatus', ['deploy', 'deployment', 'change set status']],
  ['Outbound Change Sets', 'OutboundChangeSet', ['change set', 'outbound']],
  ['Inbound Change Sets', 'InboundChangeSet', ['change set', 'inbound']],
  ['Installed Packages', 'ImportedPackage', ['package', 'managed package', 'install']],
  ['Sandboxes', 'DataManagementCreateTestInstance', ['sandbox', 'refresh']],
  ['Dev Hub', 'DevHub', ['dev hub', 'scratch org']],

  // — UI & apps —
  ['App Manager', 'NavigationMenus', ['app', 'app manager', 'lightning app']],
  ['Lightning App Builder', 'FlexiPageList', ['app builder', 'flexipage', 'record page']],
  ['Themes and Branding', 'ThemingAndBranding', ['theme', 'branding', 'logo']],
  ['Global Actions', 'GlobalActions', ['action', 'quick action']],
  ['Report Types', 'CustomReportTypes', ['report type', 'crt']],
  ['Reports and Dashboards Settings', 'ReportsDashboardsSettings', ['report settings']],
  ['Email Deliverability', 'OrgEmailSettings', ['deliverability', 'email settings']],
  ['Email Templates', 'CommunicationTemplatesEmail', ['email template']],
  ['Company Information', 'CompanyProfileInfo', ['company', 'org id', 'licenses']],
  ['Business Hours', 'BusinessHours', ['business hours', 'holiday']],
  ['Territory Settings', 'Territory2Settings', ['territory']],
  ['Digital Experiences', 'Sites', ['community', 'experience cloud', 'site']]
];

/**
 * Static Setup destinations.
 *
 * Anything a category already owns is filtered out here — otherwise typing
 * "permission set" would return both a "Permission Sets" category row and a
 * near-identical "Permission Sets" Setup row, which is the duplicate that made
 * the list confusing. The Setup page is still one keystroke away: it is the
 * first row inside the category.
 */
export const SETUP_PAGES = ROUTES.filter(([, node]) => !CATEGORY_NODES.has(node)).map(
  ([label, node, keywords]) => ({
    id: `setup:${node}`,
    type: TYPE.SETUP,
    value: node,
    label,
    sublabel: 'Setup',
    badge: 'SETUP',
    keywords,
    url: `/lightning/setup/${node}/home`
  })
);
