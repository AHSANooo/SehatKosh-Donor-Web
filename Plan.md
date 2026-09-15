```markdown
# SehatKosh Master Implementation Blueprint (`plan.md`)
**Target Release:** v1.0.0-rc  
**Architecture Classification:** HL7 FHIR R4 Compliant Distributed Health Record System  
**Maintainers:** Lead Systems Architect & Clinical Informatics Core  

---

## 1. System Architecture & Monorepo Topology

The platform operates as an enterprise monorepo driven by **Turborepo** and **pnpm workspaces**. It enforces strict boundary isolation between mobile clients, clinical web portals, core domain packages, and backend microservices.

### 1.1 Directory Structure

```tree
sehatkosh/
├── .npmrc
├── package.json
├── turbo.json
├── pnpm-workspace.yaml
├── apps/
│   ├── mobile/                     # React Native Expo SDK (Patient Portal)
│   │   ├── app/                    # Expo Router file-based routes
│   │   ├── components/             # Reusables, primitives, and domain widgets
│   │   ├── hooks/                  # TanStack Query & sensor hooks
│   │   ├── tailwind.config.js      # NativeWind v4 + Tailwind v3.4.x binding
│   │   └── package.json
│   └── doctor-web/                 # Next.js 14 App Router (Multi-Role Portal)
│       ├── app/                    # (admin, doctor, registrar, hospital-admin)
│       ├── components/             # Radix primitives, charts, clinical viewer
│       ├── hooks/                  # TanStack Query and WebSocket bridges
│       ├── tailwind.config.ts      # Tailwind CSS v3.4.x
│       └── package.json
├── packages/
│   ├── types/                      # Canonical FHIR R4 interfaces & DTO schemas
│   ├── mock-data/                  # Synthetic fixtures & async network mocks
│   └── tailwind-config/            # Shared clinical color tokens & theme presets
├── services/
│   └── backend/                    # FastAPI Modular Monolith (Python 3.11+)
│       ├── app/
│       │   ├── api/                # v1 Routers (auth, fhir, ingest, audit)
│       │   ├── core/               # Config, security, database session
│       │   ├── models/             # SQLAlchemy 2.0 Async PG models
│       │   ├── schemas/            # Pydantic v2 FHIR models
│       │   └── services/           # OCR parser, Neo4j contraindication graph
│       ├── requirements.txt
│       └── Dockerfile
└── infra/
    └── docker/
        ├── docker-compose.yml       # PG 16, Neo4j 5, LocalStack
        └── init-s3.sh               # LocalStack S3 bucket provisioning

```

### 1.2 Package Resolution Locks

#### `.npmrc`

Enforces hoisting behavior required by Metro Bundler to prevent duplicate React runtime instances and symbolic link resolution failures in Expo.

```ini
shamefully-hoist=true
strict-peer-dependencies=false
auto-install-peers=true

```

#### `pnpm-workspace.yaml`

```yaml
packages:
  - 'apps/*'
  - 'packages/*'

```

#### `turbo.json`

```json
{
  "$schema": "[https://turbo.build/schema.json](https://turbo.build/schema.json)",
  "globalDependencies": [".env"],
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": [".next/**", "!.next/cache/**", "dist/**"]
    },
    "lint": {
      "dependsOn": ["^lint"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    }
  }
}

```

---

## 2. Shared Packages Specification

### 2.1 `@sehatkosh/types`

Houses standardized data transfer objects, TypeScript interfaces for HL7 FHIR R4 resources, and system-wide enums.

```typescript
// packages/types/src/fhir.ts

export type FHIRResourceType = 
  | 'Patient' 
  | 'MedicationRequest' 
  | 'Observation' 
  | 'DiagnosticReport' 
  | 'Consent';

export interface Coding {
  system: '[http://snomed.info/sct](http://snomed.info/sct)' | '[http://loinc.org](http://loinc.org)' | '[http://unitsofmeasure.org](http://unitsofmeasure.org)' | string;
  code: string;
  display: string;
}

export interface CodeableConcept {
  coding?: Coding[];
  text: string; // Mandatory: Preserves unmapped local Pakistani brand names
}

export interface FHIRMedicationRequest {
  resourceType: 'MedicationRequest';
  id: string;
  status: 'active' | 'completed' | 'cancelled' | 'entered-in-error';
  intent: 'order';
  medicationCodeableConcept: CodeableConcept;
  subject: { reference: string; display: string };
  authoredOn: string; // ISO 8601
  dosageInstruction: Array<{
    text: string;
    timing?: { code?: { text: string } };
    route?: CodeableConcept;
    doseAndRate?: Array<{
      doseQuantity?: { value: number; unit: string; system: string; code: string };
    }>;
  }>;
}

export interface FHIRObservation {
  resourceType: 'Observation';
  id: string;
  status: 'final';
  category: Array<{ coding: Coding[] }>;
  code: CodeableConcept;
  subject: { reference: string };
  effectiveDateTime: string;
  valueQuantity?: {
    value: number;
    unit: string;
    system: '[http://unitsofmeasure.org](http://unitsofmeasure.org)';
    code: string;
  };
  interpretation?: Array<CodeableConcept>;
}

export interface FHIRConsent {
  resourceType: 'Consent';
  id: string;
  status: 'active' | 'inactive';
  scope: { coding: Coding[] };
  category: Array<{ coding: Coding[] }>;
  patient: { reference: string };
  provision: {
    period: { start: string; end: string };
    actor: Array<{ role: CodeableConcept; reference: { reference: string } }>;
  };
}

```

### 2.2 `@sehatkosh/tailwind-config`

Shared design tokens ensuring visual parity across mobile and web platforms.

```javascript
// packages/tailwind-config/index.js
module.exports = {
  theme: {
    extend: {
      colors: {
        clinical: {
          50: '#F0FDF4',
          100: '#DCFCE7',
          500: '#10B981',
          700: '#047857',
          900: '#064E3B',
        },
        danger: {
          50: '#FEF2F2',
          500: '#EF4444',
          700: '#B91C1C',
          900: '#7F1D1D',
        },
        surface: {
          base: '#FFFFFF',
          subtle: '#F8FAFC',
          card: '#FFFFFF',
          border: '#E2E8F0',
        }
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'monospace'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      }
    }
  }
};

```

---

## 3. Mobile Client Architecture (`apps/mobile`)

### 3.1 Layout & Display Calibrations

```
┌────────────────────────────────────────────────────────┐
│ Top Inset Clearance: Math.max(insets.top, 16) + 8px   │
├────────────────────────────────────────────────────────┤
│                                                        │
│                    MAIN SCROLL VIEW                    │
│                                                        │
├────────────────────────────────────────────────────────┤
│ Chat Input Bar (Max 5 lines, flex-grow)                │
├────────────────────────────────────────────────────────┤
│ Resting Clearance: Flush against tab bar (8px gap)     │
├────────────────────────────────────────────────────────┤
│ Bottom Tab Bar (~65px)                                 │
└────────────────────────────────────────────────────────┘

```

#### Safe Area Calculation

Dynamic island and status bar overlap is systematically resolved at the root container:

```typescript
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export function ScreenWrapper({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const calculatedTop = Math.max(insets.top, 16) + 8;

  return (
    <View 1, calculatedTop className="bg-surface-subtle" flex: paddingTop: style="{{" }}>
      {children}
    </View>
  );
}

```

#### Keyboard Avoidance Mechanics

* **iOS:** Enforce `behavior="padding"` with `keyboardVerticalOffset` calibrated to bottom tab bar height (65px) to prevent over-elevation.
* **Android:** Enforce `behavior={undefined}`. Let the Android window manager resize the layout natively without injecting phantom height increments.

```tsx
<KeyboardAvoidingView 'ios' 'padding' 0} 1 65 : ? behavior="{Platform.OS" flex: keyboardVerticalOffset="{Platform.OS" style="{{" undefined} }}>
  {/* Chat/Intake container */}
</KeyboardAvoidingView>

```

#### Assistant Suggestions Dismissal

* Position suggestion pills inside `ListHeaderComponent` above the message list.
* Hook visibility to `messages.length === 0`.
* Dismiss suggestions automatically on first prompt submission or chip click.

### 3.2 Clinical Intake Pipeline

```
[Center '+' FAB] 
       │
       ▼
[Consultation Logging] ───► Symptoms, Doctor Info, Audio Scribe
       │
       ▼
[Document Capture] ────────► Bottom Shutter Controls
       │
       ▼
[Feedback Modal] ──────────► 2.2s Deterministic Sequence (Progressive States)
       │
       ▼
[Split Verification] ─────► 40% Zoomable Scan / 60% Editable FHIR Form

```

#### 2.2-Second Progressive Feedback State Machine

Camera shutter transitions directly to an elevated glassmorphic modal executing a timed state loop before pushing the extracted review view:

```typescript
// apps/mobile/components/intake/ExtractionModal.tsx
import React, { useEffect, useState } from 'react';
import { View, Text, Modal, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { ShieldCheck, ScanLine, FileText } from 'lucide-react-native';

export function ExtractionModal({ visible, imageUri }: { visible: boolean; imageUri: string }) {
  const router = useRouter();
  const [step, setStep] = useState<number>(1);

  useEffect(() => {
    if (!visible) return;

    const t1 = setTimeout(() => setStep(2), 700);
    const t2 = setTimeout(() => setStep(3), 1500);
    const t3 = setTimeout(() => {
      router.push({ pathname: '/intake/ocr-verify', params: { uri: imageUri } });
    }, 2200);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [visible, imageUri]);

  return (
    <Modal animationType="fade" transparent visible="{visible}">
      <View className="flex-1 bg-black/70 items-center justify-center p-6">
        <View className="bg-surface-base w-full max-w-sm rounded-2xl p-6 items-center shadow-xl">
          {step === 1 && (
            <>
              <ScanLine color="#10B981" size="{48}"/>
              <Text className="text-slate-900 font-semibold mt-4 text-base">
                Scanning document geometry & contrast...
              </Text>
            </>
          )}
          {step === 2 && (
            <>
              <FileText color="#0284C7" size="{48}"/>
              <Text className="text-slate-900 font-semibold mt-4 text-base">
                Extracting clinical text via Vision Pipeline...
              </Text>
            </>
          )}
          {step === 3 && (
            <>
              <ShieldCheck color="#047857" size="{48}"/>
              <Text className="text-slate-900 font-semibold mt-4 text-base">
                Structuring FHIR MedicationRequest entities...
              </Text>
            </>
          )}
          <ActivityIndicator className="mt-4" color="#10B981" size="small"/>
        </View>
      </View>
    </Modal>
  );
}

```

### 3.3 Split-Screen Verification View

* **Top 40% Viewport:** Scalable, pinch-to-zoom high-resolution preview of the scanned prescription document.
* **Bottom 60% Viewport:** Scrollable data-entry form parsing detected dosage, frequency, and drug identities into verified FHIR resources. Padded with `contentContainerStyle={{ paddingBottom: 96 }}` to clear bottom action bars.

### 3.4 Hard-Stop Safety Alert Layer

When extracted medication regimens conflict with verified patient records (e.g., penicillin prescribed to a penicillin-allergic patient, or Ciprofloxacin co-prescribed with Tizanidine):

1. The UI blocks the standard "Save to Record" path.
2. A non-dismissible red alert banner mounts (`bg-danger-50 border-danger-500`).
3. An explicit override checkbox must be ticked before persistence is unlocked:
`[ ] I have reviewed the contraindication warning and confirm clinical intent.`

---

## 4. Clinical Web Architecture (`apps/doctor-web`)

### 4.1 Defensive UI Execution Rules

* **No `localStorage` for Active Roles:** Active context is derived strictly from `usePathname()`.
* **Zero Runtime Crashes:** Every rendered property must utilize defensive optional chaining with localized fallbacks:
```tsx
<p className="text-sm font-medium text-slate-800">
  {patient?.telecom?.[0]?.value ?? '--'}
</p>

```


* **Guarded Interactions:** Every visual button, menu trigger, or interactive card must possess an active handler. Unimplemented backend bridges must log to console or trigger defensive feedback toasts rather than failing silently.

### 4.2 Universal Role Switcher Shell

Located in `apps/doctor-web/components/layout/RoleNavigationBanner.tsx`:

```tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const ROLES = [
  { name: 'Super Admin', path: '/admin' },
  { name: 'Consulting Doctor', path: '/doctor' },
  { name: 'Help Desk / Registrar', path: '/registrar' },
  { name: 'Hospital Admin', path: '/hospital-admin' },
];

export function RoleNavigationBanner() {
  const pathname = usePathname();

  return (
    <header className="h-10 bg-slate-950 text-slate-200 px-6 flex items-center justify-between border-b border-slate-800 text-xs select-none">
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 rounded-full bg-clinical-500 animate-pulse" />
        <span className="font-mono uppercase tracking-wider font-semibold text-white">
          SehatKosh Clinical Fabric
        </span>
      </div>
      <nav className="flex items-center gap-1">
        {ROLES.map((role) => {
          const isActive = pathname.startsWith(role.path);
          return (
            <Link ${ 'bg-clinical-700 'text-slate-400 : ? className="{`px-3" font-medium hover:bg-slate-800' hover:text-white href="{role.path}" isActive key="{role.path}" py-1 rounded shadow-sm' text-white transition-colors }`}>
              {role.name}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}

```

### 4.3 Multi-Role Dashboard Specifications

#### 1. Super Admin Dashboard (`/admin`)

* **Platform Health Matrix:** Active hospital licenses, online practitioner count, FHIR ingestion rates, total data purges requested.
* **Hospital Onboarding Engine:** Verifies enterprise health system licenses, assigns regional routing codes, issues tenant API keys.
* **2-of-3 Quorum Sign-Off Protocol:**
```
[Super Admin 1 triggers: Purge Hospital Registry H-9821]
                         │
                         ▼
[Status: PENDING_QUORUM (1/2 Signatures Acquired)]
                         │
                         ├── Requires Admin 2 or 3 Authorization
                         ▼
[Super Admin 2 signs with Session Token] ───► Action Executed & Logged

```


* **De-Identification Export Engine:** Strips direct PII (CNIC, names, contact numbers, street addresses), aggregates patient ages into 5-year buckets, and issues sanitized FHIR R4 JSON bundles for research.

#### 2. Consulting Doctor Dashboard (`/doctor`)

Enforces the **30-Second Rule**:

```
┌────────────────────────────────────────────────────────┐
│ 0-5s: Anchor Banner (Demographics, Age, Blood, Allergies)│
├────────────────────────────────────────────────────────┤
│ 5-15s: 10-Second Clinical TL;DR Card (Emerald Slate)   │
│ - Primary Active Conditions                            │
│ - Current Regimen & Contradictions                     │
├───────────────────────────┬────────────────────────────┤
│ 15-30s: Dual-Pane View    │ Structured SOAP Dossier    │
│ Chronological Encounters  │ High-Res Scan Viewer       │
│ Lab Timeline              │ Electronic Prescriptions   │
└───────────────────────────┴────────────────────────────┘

```

* **24-Hour Scoped Access Protocol:**
* Post-consultation access countdown runs on an ephemeral token.
* *Active (<24h):* Displays green countdown badge `[Access Active: 14h 22m Remaining]`.
* *Expired (>24h):* Encounters, lab results, and documents blur out. The view locks down to non-clinical baseline data (Name, Blood Type, Emergency Contact).
* *Extension:* The doctor clicks `Request Access Extension`, triggering a high-priority push notification to the patient's mobile device.



#### 3. Help Desk / Registrar Dashboard (`/registrar`)

* **Strict PII Sandbox:** Personnel view identity verification fields only (CNIC, Mobile Number, Full Name, Age, Gender). Clinical history, diagnoses, and prescriptions are blocked at the component and API layer.
* **Quick Intake Desk:** Rapid walk-in registration mapping patients to departmental clinics and on-duty doctors.
* **Consent Push Notification Dispatch:** Triggers real-time approval prompts to the patient's device for doctor authorization.
* **Audited Emergency Break-Glass Override:**
* Bypasses patient consent under immediate medical peril.
* Demands: Target Patient ID, Clinician ID, Attesting Witness Staff ID, and Clinical Justification.
* Directly writes an immutable record to the system audit ledger.



#### 4. Hospital Admin Dashboard (`/hospital-admin`)

* **Roster Management:** Configures departmental room mappings, staff shifts, and active practitioner statuses.
* **Paper Batch Ingestion Clearinghouse:** High-throughput document scanner upload interface designed for hospital digitization teams processing historical paper charts.
* **Case Study Clearance Desk:** Vets research case-study escalation requests submitted by consulting physicians before forwarding them to the Super Admin anonymization queue.

---

## 5. Backend Services & Data Infrastructure

### 5.1 Infrastructure Orchestration

#### `infra/docker/docker-compose.yml`

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:16-alpine
    container_name: sehatkosh-postgres
    environment:
      POSTGRES_DB: sehatkosh_db
      POSTGRES_USER: sehatkosh_admin
      POSTGRES_PASSWORD: development_secret_password
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U sehatkosh_admin -d sehatkosh_db"]
      interval: 5s
      timeout: 5s
      retries: 5

  neo4j:
    image: neo4j:5-community
    container_name: sehatkosh-neo4j
    environment:
      NEO4J_AUTH: neo4j/development_graph_secret
    ports:
      - "7474:7474"
      - "7687:7687"
    volumes:
      - neo4jdata:/data

  localstack:
    image: localstack/localstack:latest
    container_name: sehatkosh-localstack
    ports:
      - "4566:4566"
    environment:
      - SERVICES=s3
      - AWS_DEFAULT_REGION=us-east-1
    volumes:
      - ./init-s3.sh:/etc/localstack/init/ready.d/init-s3.sh
      - localstackdata:/var/lib/localstack

volumes:
  pgdata:
  neo4jdata:
  localstackdata:

```

#### `infra/docker/init-s3.sh`

```bash
#!/bin/bash
awslocal s3 mb s3://sehatkosh-prescriptions
awslocal s3 mb s3://sehatkosh-research-exports
echo "LocalStack S3 Provisioning Complete."

```

### 5.2 FastAPI Architecture (`services/backend`)

#### Core Dependencies (`requirements.txt`)

```text
fastapi>=0.110.0
uvicorn[standard]>=0.28.0
sqlalchemy[asyncio]>=2.0.28
asyncpg>=0.29.0
pydantic>=2.6.4
neo4j>=5.18.0
aioboto3>=12.3.0
python-jose[cryptography]>=3.3.0
passlib[bcrypt]>=1.7.4
python-multipart>=0.0.9

```

#### Database Schema: SQLAlchemy 2.0 Async

```python
# services/backend/app/models/clinical.py
from datetime import datetime
from uuid import uuid4
from sqlalchemy import String, DateTime, ForeignKey, Index
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

class Base(DeclarativeBase):
    pass

class PatientModel(Base):
    __tablename__ = "patients"

    id: Mapped[UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    cnic_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    fhir_payload: Mapped[dict] = mapped_column(JSONB, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    encounters = relationship("EncounterModel", back_populates="patient")

class EncounterModel(Base):
    __tablename__ = "encounters"

    id: Mapped[UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    patient_id: Mapped[UUID] = mapped_column(ForeignKey("patients.id"), nullable=False)
    practitioner_id: Mapped[str] = mapped_column(String(64), nullable=False)
    status: Mapped[str] = mapped_column(String(32), default="in-progress")
    soap_notes: Mapped[dict] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    patient = relationship("PatientModel", back_populates="encounters")
    documents = relationship("PrescriptionDocumentModel", back_populates="encounter")

class PrescriptionDocumentModel(Base):
    __tablename__ = "prescription_documents"

    id: Mapped[UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    encounter_id: Mapped[UUID] = mapped_column(ForeignKey("encounters.id"), nullable=False)
    s3_key: Mapped[str] = mapped_column(String(255), nullable=False)
    raw_ocr_text: Mapped[str] = mapped_column(String, nullable=True)
    fhir_bundle: Mapped[dict] = mapped_column(JSONB, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    encounter = relationship("EncounterModel", back_populates="documents")

class AuditLedgerModel(Base):
    __tablename__ = "audit_ledger"

    id: Mapped[UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    actor_id: Mapped[str] = mapped_column(String(64), nullable=False)
    action: Mapped[str] = mapped_column(String(64), nullable=False)
    target_resource: Mapped[str] = mapped_column(String(128), nullable=False)
    is_break_glass: Mapped[bool] = mapped_column(default=False)
    justification: Mapped[str] = mapped_column(String, nullable=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

```

### 5.3 Neo4j Clinical Knowledge Graph

Models contraindications, drug-drug interactions, and drug-allergy pathways:

```cypher
// Knowledge Graph Initialization
CREATE CONSTRAINT unique_drug_code IF NOT EXISTS
FOR (d:Drug) REQUIRE d.code IS UNIQUE;

CREATE CONSTRAINT unique_allergy_code IF NOT EXISTS
FOR (a:Allergy) REQUIRE a.code IS UNIQUE;

// Core Conflict Relationship Schema
// (:Drug {code, name})-[:CONTRAINDICATED_WITH {severity: 'HIGH'}]->(:Drug)
// (:Drug {code, name})-[:TRIGGERS_ALLERGY]->(:Allergy)

MATCH (d1:Drug {code: 'snomed:372862008'}) // Ciprofloxacin
MATCH (d2:Drug {code: 'snomed:387340004'}) // Tizanidine
MERGE (d1)-[r:CONTRAINDICATED_WITH {severity: 'CRITICAL', reason: 'CYP1A2 Inhibition'}]->(d2);

```

#### Query Implementation: Real-Time Drug Interaction Check

```python
# services/backend/app/services/safety.py
from neo4j import AsyncGraphDatabase

class ClinicalSafetyEngine:
    def __init__(self, uri: str, auth: tuple):
        self.driver = AsyncGraphDatabase.driver(uri, auth=auth)

    async def verify_prescriptions(self, active_drug_codes: list[str], proposed_drug_code: str):
        query = """
        MATCH (proposed:Drug {code: $proposed_code})-[r:CONTRAINDICATED_WITH]-(active:Drug)
        WHERE active.code IN $active_codes
        RETURN active.name AS conflicting_drug, r.severity AS severity, r.reason AS reason
        """
        async with self.driver.session() as session:
            result = await session.run(query, proposed_code=proposed_drug_code, active_codes=active_drug_codes)
            records = await result.data()
            return records

```

---

## 6. HL7 FHIR R4 Interoperability & Coding Specification

Clinical entities are strictly mapped to target HL7 FHIR R4 resource definitions.

| Domain Entity | FHIR R4 Resource | Standard Vocabularies | Fallback Behavior |
| --- | --- | --- | --- |
| Prescription Item | `MedicationRequest` | SNOMED-CT | Preserve raw brand name in `text`; leave `coding` array empty |
| Vital Sign / Labs | `Observation` | LOINC (Code), UCUM (Units) | Do not hallucinate LOINC; map category to generic vitals panel |
| Lab/Image Group | `DiagnosticReport` | LOINC / SNOMED-CT | Store raw diagnostic text in report narrative (`text.div`) |
| Demographics | `Patient` | ISO 3166 (Country), Local IDs | National CNIC hashed for matching; standard identifier array |
| Time Access Auth | `Consent` | SNOMED-CT (Scope) | Default to ISO 8601 strict timestamps |

### 6.1 Sample Standard Mapping: `MedicationRequest`

Preserving unmapped Pakistani brand names safely without hallucinated SNOMED ontology terms:

```json
{
  "resourceType": "MedicationRequest",
  "id": "medrx-789012",
  "status": "active",
  "intent": "order",
  "medicationCodeableConcept": {
    "coding": [
      {
        "system": "[http://snomed.info/sct](http://snomed.info/sct)",
        "code": "322236009",
        "display": "Paracetamol 500 mg oral tablet"
      }
    ],
    "text": "Panadol 500mg Tablet"
  },
  "subject": {
    "reference": "Patient/pat-9921",
    "display": "Muhammad Ahsan"
  },
  "authoredOn": "2026-09-15T14:30:00Z",
  "dosageInstruction": [
    {
      "text": "1 tablet every 8 hours as needed for fever",
      "timing": {
        "code": {
          "text": "TID"
        }
      },
      "doseAndRate": [
        {
          "doseQuantity": {
            "value": 500,
            "unit": "mg",
            "system": "[http://unitsofmeasure.org](http://unitsofmeasure.org)",
            "code": "mg"
          }
        }
      ]
    }
  ]
}

```

### 6.2 Sample Standard Mapping: `Observation`

```json
{
  "resourceType": "Observation",
  "id": "obs-blood-pressure",
  "status": "final",
  "category": [
    {
      "coding": [
        {
          "system": "[http://terminology.hl7.org/CodeSystem/observation-category](http://terminology.hl7.org/CodeSystem/observation-category)",
          "code": "vital-signs",
          "display": "Vital Signs"
        }
      ]
    }
  ],
  "code": {
    "coding": [
      {
        "system": "[http://loinc.org](http://loinc.org)",
        "code": "85354-9",
        "display": "Blood pressure panel with all children optional"
      }
    ],
    "text": "Blood Pressure"
  },
  "subject": {
    "reference": "Patient/pat-9921"
  },
  "effectiveDateTime": "2026-09-15T14:35:00Z",
  "component": [
    {
      "code": {
        "coding": [{ "system": "[http://loinc.org](http://loinc.org)", "code": "8480-6", "display": "Systolic blood pressure" }]
      },
      "valueQuantity": {
        "value": 120,
        "unit": "mmHg",
        "system": "[http://unitsofmeasure.org](http://unitsofmeasure.org)",
        "code": "mm[Hg]"
      }
    },
    {
      "code": {
        "coding": [{ "system": "[http://loinc.org](http://loinc.org)", "code": "8462-4", "display": "Diastolic blood pressure" }]
      },
      "valueQuantity": {
        "value": 80,
        "unit": "mmHg",
        "system": "[http://unitsofmeasure.org](http://unitsofmeasure.org)",
        "code": "mm[Hg]"
      }
    }
  ]
}

```

---

## 7. Security, Privacy & Compliance (HIPAA / GDPR Alignment)

```
┌───────────────────────────────────────────────────────────┐
│                    SECURITY ARCHITECTURE                  │
├─────────────────────────┬─────────────────────────────────┤
│ At Rest: AES-256-GCM    │ In Transit: TLS 1.3 Strict      │
├─────────────────────────┴─────────────────────────────────┤
│ RBAC Matrix                                               │
│ - Super Admin: Platform config, de-identified datasets    │
│ - Hospital Admin: Department rosters, ingestion queues   │
│ - Consulting Doctor: 24h scoped clinical records          │
│ - Help Desk / Registrar: Identity lookup only (PII masked)│
├───────────────────────────────────────────────────────────┤
│ Automated Research De-Identification:                     │
│ 1. Direct PII Removal (Name, CNIC, Phone, Address)        │
│ 2. Quasi-Identifier Binning (Age -> 5-year ranges)        │
│ 3. Audit Immutability via Append-Only PostgreSQL Log      │
└───────────────────────────────────────────────────────────┘

```

* **Role-Based Access Control (RBAC):** Verified at every API edge using cryptographic JWTs containing explicit role claims.
* **Emergency Break-Glass Audit:** An append-only table records the clinician's signature, timestamp, attesting witness ID, and justification whenever consent controls are overridden.
* **PII Redaction Engine:** Text fields passing into research pipelines are automatically stripped of regular-expression patterns matching Pakistani CNICs (`\b\d{5}-\d{7}-\d{1}\b`) and cellular numbers (`\b(03\d{2}|(\+923\d{2}))\d{7}\b`).

---

## 8. Implementation Roadmap & Verification Milestones

### Phase 1: Environment Hardening & Monorepo Wiring (Week 1)

* [ ] Enforce `.npmrc` hoisting directives (`shamefully-hoist=true`).
* [ ] Bootstrap Turborepo structure; link shared packages (`@sehatkosh/types`, `@sehatkosh/mock-data`, `@sehatkosh/tailwind-config`).
* [ ] Initialize LocalStack, PostgreSQL 16, and Neo4j via Docker Compose.

### Phase 2: Mobile UI/UX Rectifications (Week 2)

* [ ] Calibrate top screen clearings to `Math.max(insets.top, 16) + 8px`.
* [ ] Implement platform-specific keyboard avoidance (iOS tab bar padding offset, Android native resize).
* [ ] Bind assistant suggestions to thread status; auto-dismiss on message delivery.
* [ ] Build camera shutter workflow with the 2.2-second extraction modal sequence (Geometry $\rightarrow$ OCR $\rightarrow$ FHIR).
* [ ] Implement 40/60 split verification screen with bottom padding clearance.

### Phase 3: Clinical Web Dashboards (Week 3–4)

* [ ] Implement persistent global role navigation bar.
* [ ] Super Admin: Build hospital licensing workflows and 2-of-3 quorum sign-off controls.
* [ ] Consulting Doctor: Implement the 30-Second Rule layout and 24-hour access countdown mechanism.
* [ ] Help Desk / Registrar: Build PII-sandboxed patient lookup desk and emergency break-glass modal.
* [ ] Hospital Admin: Implement room rosters and paper ingestion queue.

### Phase 4: Clinical Informatics & Interoperability (Week 5)

* [ ] Seed Neo4j graph with common clinical interactions and contraindication pathways.
* [ ] Implement FastAPI FHIR ingestion routes for `MedicationRequest`, `Observation`, and `Consent`.
* [ ] Write integration tests verifying unmapped Pakistani drug names preserve raw text without invalid SNOMED generation.

### Phase 5: Proposal Defense Preparation & Hardening (Week 6)

* [ ] Run complete end-to-end integration walkthrough (Patient scans on mobile $\rightarrow$ Registrar checks in $\rightarrow$ Doctor reviews dossier within 30 seconds $\rightarrow$ Admin monitors quorum).
* [ ] Security audit: Verify zero unhandled UI click handlers and zero clinical data leaks into the Help Desk sandbox.

```

```