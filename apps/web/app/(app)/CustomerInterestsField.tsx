"use client";

import {
  Accessibility,
  BadgePercent,
  BedDouble,
  CalendarDays,
  CarFront,
  ChevronDown,
  Dumbbell,
  FileText,
  MapPin,
  PawPrint,
  Plus,
  Search,
  ShieldCheck,
  WalletCards,
  X,
  type LucideIcon,
} from "lucide-react";
import { useId } from "react";
import {
  components,
  type ClassNamesConfig,
  type ControlProps,
  type DropdownIndicatorProps,
  type FormatOptionLabelMeta,
  type GroupBase,
  type MultiValue,
  type MultiValueRemoveProps,
  type SelectComponentsConfig,
} from "react-select";
import CreatableSelect from "react-select/creatable";

import type {
  ProspectInterestCategory,
  SessionCustomerInterest,
} from "@tour/shared";

import styles from "./CustomerInterestsField.module.css";

type Props = {
  value: SessionCustomerInterest[];
  onChange: (interests: SessionCustomerInterest[]) => void;
  disabled?: boolean;
  compact?: boolean;
};

type InterestOption = {
  value: string;
  label: string;
  category: ProspectInterestCategory;
  interestId?: string;
  description?: string;
  isNew?: boolean;
};

type InterestPreset = InterestOption & {
  group: "Floor plan" | "Priorities";
};

const INTEREST_PRESETS = [
  { value: "studio", label: "Studio", description: "Studio floor plans", category: "floor_plan", group: "Floor plan" },
  { value: "1-bedroom", label: "1 bedroom", description: "One-bedroom floor plans", category: "floor_plan", group: "Floor plan" },
  { value: "2-bedroom", label: "2 bedroom", description: "Two-bedroom floor plans", category: "floor_plan", group: "Floor plan" },
  { value: "3-bedroom", label: "3 bedroom", description: "Three-bedroom floor plans", category: "floor_plan", group: "Floor plan" },
  { value: "budget", label: "Budget", description: "Target rent or monthly spend", category: "budget_specials", group: "Priorities" },
  { value: "specials", label: "Current specials", description: "Offers, discounts, and concessions", category: "budget_specials", group: "Priorities" },
  { value: "move-in", label: "Move-in timing", description: "Preferred move-in date", category: "move_in_timing", group: "Priorities" },
  { value: "amenities", label: "Amenities", description: "Community and apartment features", category: "amenities", group: "Priorities" },
  { value: "pets", label: "Pet friendly", description: "Pet policy, limits, and fees", category: "pets", group: "Priorities" },
  { value: "parking", label: "Parking", description: "Parking options and costs", category: "parking_transportation", group: "Priorities" },
  { value: "commute", label: "Location or commute", description: "Neighborhood and commute fit", category: "location_commute", group: "Priorities" },
  { value: "lease-terms", label: "Lease terms", description: "Lease length, deposits, and terms", category: "lease_terms", group: "Priorities" },
  { value: "accessibility", label: "Accessibility", description: "Accessibility requirements", category: "accessibility", group: "Priorities" },
  { value: "security", label: "Community security", description: "Access and security preferences", category: "community_security", group: "Priorities" },
] as const satisfies readonly InterestPreset[];

const SELECT_CLASS_NAMES: ClassNamesConfig<InterestOption, true, GroupBase<InterestOption>> = {
  container: () => className(styles.container),
  control: ({ isDisabled, isFocused }) => [
    styles.control,
    isFocused ? styles.controlFocused : "",
    isDisabled ? styles.controlDisabled : "",
  ].filter(Boolean).join(" "),
  valueContainer: () => className(styles.valueContainer),
  input: () => className(styles.input),
  placeholder: () => className(styles.placeholder),
  multiValue: () => className(styles.multiValue),
  multiValueLabel: () => className(styles.multiValueLabel),
  multiValueRemove: () => className(styles.multiValueRemove),
  indicatorsContainer: () => className(styles.indicators),
  indicatorSeparator: () => className(styles.indicatorSeparator),
  dropdownIndicator: () => className(styles.dropdownIndicator),
  menu: () => className(styles.menu),
  menuList: () => className(styles.menuList),
  group: () => className(styles.group),
  groupHeading: () => className(styles.groupHeading),
  option: ({ isFocused, isSelected }) => [
    styles.option,
    isFocused ? styles.optionFocused : "",
    isSelected ? styles.optionSelected : "",
  ].filter(Boolean).join(" "),
  noOptionsMessage: () => className(styles.noOptions),
};

const SELECT_COMPONENTS: SelectComponentsConfig<InterestOption, true, GroupBase<InterestOption>> = {
  Control: InterestControl,
  DropdownIndicator: InterestDropdownIndicator,
  IndicatorSeparator: null,
  MultiValueRemove: InterestMultiValueRemove,
};

export function CustomerInterestsField({
  value,
  onChange,
  disabled = false,
  compact = false,
}: Props) {
  const fieldId = useId();
  const atLimit = value.length >= 8;
  const selectedLabels = new Set(value.map((interest) => normalizeLabel(interest.detail)));
  const selectedOptions: InterestOption[] = value.map((interest) => ({
    value: interest.id,
    label: interest.detail,
    category: interest.category,
    interestId: interest.id,
  }));
  const availableOptions = buildAvailableGroups(selectedLabels);

  const updateSelectedInterests = (options: MultiValue<InterestOption>) => {
    const nextInterests = options.slice(0, 8).map((option) => {
      const existing = option.interestId
        ? value.find((interest) => interest.id === option.interestId)
        : value.find((interest) => (
          normalizeLabel(interest.detail) === normalizeLabel(option.label)
        ));

      return existing ?? {
        id: createInterestId(),
        category: option.category,
        detail: option.label.trim(),
      };
    });

    onChange(nextInterests);
  };

  const createInterest = (inputValue: string) => {
    const detail = inputValue.trim();
    if (
      !detail
      || atLimit
      || selectedLabels.has(normalizeLabel(detail))
    ) {
      return;
    }

    onChange([
      ...value,
      {
        id: createInterestId(),
        category: inferCustomCategory(detail),
        detail,
      },
    ]);
  };

  const isValidNewInterest = (inputValue: string) => {
    const detail = inputValue.trim();
    return Boolean(
      detail
      && !atLimit
      && !selectedLabels.has(normalizeLabel(detail))
    );
  };

  return (
    <section className={`${styles.field} ${compact ? styles.compact : ""}`}>
      <div className={styles.labelRow}>
        <label htmlFor={`${fieldId}-input`}>Customer interests</label>
        <span>Optional</span>
      </div>

      <CreatableSelect<InterestOption, true, GroupBase<InterestOption>>
        inputId={`${fieldId}-input`}
        instanceId={fieldId}
        classNames={SELECT_CLASS_NAMES}
        components={SELECT_COMPONENTS}
        unstyled
        isMulti
        isClearable={false}
        isDisabled={disabled}
        isSearchable={!atLimit}
        menuIsOpen={atLimit ? false : undefined}
        closeMenuOnSelect={false}
        blurInputOnSelect={false}
        hideSelectedOptions
        openMenuOnFocus
        maxMenuHeight={240}
        options={availableOptions}
        value={selectedOptions}
        placeholder={value.length > 0 ? null : "Search or create interests"}
        getNewOptionData={getNewInterestOption}
        formatOptionLabel={formatOptionLabel}
        isValidNewOption={isValidNewInterest}
        noOptionsMessage={({ inputValue }) => (
          inputValue.trim() ? "Press Enter to add" : "No more interests"
        )}
        onCreateOption={createInterest}
        onChange={updateSelectedInterests}
      />
    </section>
  );
}

function InterestControl(
  props: ControlProps<InterestOption, true, GroupBase<InterestOption>>
) {
  return (
    <components.Control {...props}>
      <span className={styles.searchIcon}>
        <Search size={15} strokeWidth={1.9} aria-hidden="true" />
      </span>
      {props.children}
    </components.Control>
  );
}

function InterestDropdownIndicator(
  props: DropdownIndicatorProps<InterestOption, true, GroupBase<InterestOption>>
) {
  return (
    <components.DropdownIndicator {...props}>
      <ChevronDown size={15} strokeWidth={2} aria-hidden="true" />
    </components.DropdownIndicator>
  );
}

function InterestMultiValueRemove(
  props: MultiValueRemoveProps<InterestOption, true, GroupBase<InterestOption>>
) {
  return (
    <components.MultiValueRemove {...props}>
      <X size={12} strokeWidth={2.2} aria-hidden="true" />
    </components.MultiValueRemove>
  );
}

function renderCreateOption(inputValue: string) {
  return (
    <span className={styles.createOption}>
      <span className={styles.createIcon}>
        <Plus size={13} strokeWidth={2.2} aria-hidden="true" />
      </span>
      Create <strong>{inputValue.trim()}</strong>
    </span>
  );
}

function formatOptionLabel(
  option: InterestOption,
  meta: FormatOptionLabelMeta<InterestOption>
) {
  if (meta.context === "value") return option.label;
  if (option.isNew) return renderCreateOption(option.label);

  const Icon = getInterestIcon(option);
  return (
    <span className={styles.optionContent}>
      <span className={styles.optionIcon}>
        <Icon size={15} strokeWidth={1.9} aria-hidden="true" />
      </span>
      <span className={styles.optionCopy}>
        <strong>{option.label}</strong>
        {option.description && <small>{option.description}</small>}
      </span>
    </span>
  );
}

function getNewInterestOption(inputValue: string): InterestOption {
  const detail = inputValue.trim();
  return {
    value: `custom:${normalizeLabel(detail)}`,
    label: detail,
    category: inferCustomCategory(detail),
    isNew: true,
  };
}

function getInterestIcon(option: InterestOption): LucideIcon {
  if (option.value === "specials") return BadgePercent;
  if (option.value === "budget") return WalletCards;
  if (option.value === "move-in") return CalendarDays;
  if (option.value === "amenities") return Dumbbell;
  if (option.value === "pets") return PawPrint;
  if (option.value === "parking") return CarFront;
  if (option.value === "commute") return MapPin;
  if (option.value === "lease-terms") return FileText;
  if (option.value === "accessibility") return Accessibility;
  if (option.value === "security") return ShieldCheck;
  return BedDouble;
}

function buildAvailableGroups(selectedLabels: Set<string>): Array<GroupBase<InterestOption>> {
  return (["Floor plan", "Priorities"] as const)
    .map((group) => ({
      label: group,
      options: INTEREST_PRESETS
        .filter((preset) => (
          preset.group === group
          && !selectedLabels.has(normalizeLabel(preset.label))
        ))
        .map(({ group: _group, ...preset }) => preset),
    }))
    .filter((group) => group.options.length > 0);
}

function className(value: string | undefined) {
  return value ?? "";
}

function normalizeLabel(value: string) {
  return value.trim().toLocaleLowerCase();
}

function inferCustomCategory(detail: string): ProspectInterestCategory {
  const value = normalizeLabel(detail);
  if (/\b(studio|bed|bedroom|floor plan|unit)\b/.test(value)) return "floor_plan";
  if (/\b(budget|rent|price|special|discount|deal)\b/.test(value)) return "budget_specials";
  if (/\b(move|timing|date|available|availability)\b/.test(value)) return "move_in_timing";
  if (/\b(amenity|pool|gym|balcony|laundry)\b/.test(value)) return "amenities";
  if (/\b(pet|dog|cat)\b/.test(value)) return "pets";
  if (/\b(parking|garage|transit|train|bus)\b/.test(value)) return "parking_transportation";
  if (/\b(location|commute|neighborhood|school|work)\b/.test(value)) return "location_commute";
  if (/\b(lease|term|deposit)\b/.test(value)) return "lease_terms";
  if (/\b(access|accessible|elevator|wheelchair)\b/.test(value)) return "accessibility";
  if (/\b(secure|security|gate|gated)\b/.test(value)) return "community_security";
  return "other";
}

function createInterestId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `interest-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
