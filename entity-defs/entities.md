---
entities:
  - key: user
    label: User
    type: user
    create_directory: user
    scan_directories:
      - user
    id_strategy: singleton
    name_template: "{{name}}"
    include_in_initialization: true
    fields:
      - key: name
        label: Name
        type: string
        description: Preferred name for the primary human user of the workspace.
      - key: summary
        label: Summary
        type: string
        description: Short durable summary of the user in relation to the workspace.
    files:
      - path: record.md
        template: user/record.md

  - key: company
    label: Company
    type: company
    create_directory: companies
    scan_directories:
      - companies
    id_strategy: prefixed-slug
    id_prefix: co
    id_source_fields:
      - name
    name_template: "{{name}}"
    status_field: status
    include_in_initialization: true
    fields:
      - key: name
        label: Name
        type: string
        description: Company name.
        required: true
      - key: status
        label: Status
        type: string
        description: Current operating state.
        required: true
      - key: summary
        label: Summary
        type: string
        description: Short description of the company or workspace context.
    files:
      - path: record.md
        template: company/record.md

  - key: work-item
    label: Work Item
    type: work-item
    create_directory: work-items
    scan_directories:
      - work-items
    id_strategy: prefixed-slug
    id_prefix: wi
    id_source_fields:
      - name
    name_template: "{{name}}"
    status_field: status
    owner_field: owner
    fields:
      - key: name
        label: Name
        type: string
        description: Clear human-readable title.
        required: true
      - key: owner
        label: Owner
        type: string
        description: Directly accountable owner.
        required: true
      - key: status
        label: Status
        type: string
        description: Current state.
        required: true
      - key: company
        label: Company
        type: string
        description: Related company record ID.
      - key: summary
        label: Summary
        type: string
        description: Short statement of the work item's purpose.
    files:
      - path: record.md
        template: work-item/record.md
---

# Entity Definitions

Minimal bootstrap schema for a company-centered workspace with a single primary user, one company record, and business-analysis work items.
