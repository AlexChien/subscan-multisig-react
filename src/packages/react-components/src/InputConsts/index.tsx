// Copyright 2017-2021 @polkadot/react-components authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { ConstantCodec } from '@polkadot/metadata/decorate/types';

import React, { useCallback, useState } from 'react';

import { ApiPromise } from '@polkadot/api';
import { useApi } from '@polkadot/react-hooks';
import type { DropdownOptions } from '../util/types';

import LinkedWrapper from '../InputExtrinsic/LinkedWrapper';
import type { ConstValue, ConstValueBase } from './types';
import keyOptions from './options/key';
import sectionOptions from './options/section';
import SelectKey from './SelectKey';
import SelectSection from './SelectSection';

interface Props {
  className?: string;
  defaultValue: ConstValueBase;
  help?: React.ReactNode;
  isError?: boolean;
  label: React.ReactNode;
  onChange?: (value: ConstValue) => void;
  withLabel?: boolean;
}

function getValue(api: ApiPromise, { method, section }: ConstValueBase): ConstValue {
  const firstSec = Object.keys(api.consts)[0];
  const firstMet = Object.keys(api.consts[firstSec])[0];
  const value =
    api.consts[section] && api.consts[section][method] ? { method, section } : { method: firstMet, section: firstSec };

  return {
    ...value,
    meta: (api.consts[value.section][value.method] as ConstantCodec).meta,
  };
}

function InputConsts({
  className = '',
  defaultValue,
  help,
  label,
  onChange,
  withLabel,
}: Props): React.ReactElement<Props> {
  const { api } = useApi();
  const [optionsMethod, setOptionsMethod] = useState<DropdownOptions>(() => keyOptions(api, defaultValue.section));
  const [optionsSection] = useState<DropdownOptions>(() => sectionOptions(api));
  const [value, setValue] = useState<ConstValue>(() => getValue(api, defaultValue));

  const _onKeyChange = useCallback(
    (newValue: ConstValueBase): void => {
      if (value.section === newValue.section && value.method === newValue.method) {
        return;
      }

      const { method, section } = newValue;
      const meta = (api.consts[section][method] as ConstantCodec).meta;
      const updated = { meta, method, section };

      setValue(updated);
      // eslint-disable-next-line
      onChange && onChange(updated);
    },
    [api, onChange, value]
  );

  const _onSectionChange = useCallback(
    (section: string): void => {
      if (section === value.section) {
        return;
      }

      // eslint-disable-next-line @typescript-eslint/no-shadow
      const optionsMethod = keyOptions(api, section);

      setOptionsMethod(optionsMethod);
      _onKeyChange({ method: optionsMethod[0].value, section });
    },
    [_onKeyChange, api, value]
  );

  return (
    <LinkedWrapper className={className} help={help} label={label} withLabel={withLabel}>
      <SelectSection className="small" onChange={_onSectionChange} options={optionsSection} value={value} />
      <SelectKey className="large" onChange={_onKeyChange} options={optionsMethod} value={value} />
    </LinkedWrapper>
  );
}

export default React.memo(InputConsts);
