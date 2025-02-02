import { SubmittableExtrinsic } from '@polkadot/api/promise/types';
import { StatusContext } from '@polkadot/react-components';
import { PartialQueueTxExtrinsic } from '@polkadot/react-components/Status/types';
import BaseIdentityIcon from '@polkadot/react-identicon';
import { Call } from '@polkadot/types/interfaces';
import { AnyJson } from '@polkadot/types/types';
import { KeyringAddress } from '@polkadot/ui-keyring/types';
import { Button, Descriptions, Form, Modal, Select, Space, Spin, Table, Typography } from 'antd';
import { ColumnsType } from 'antd/lib/table';
import { intersection } from 'lodash';
import { useCallback, useContext, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useApi, useFee, useIsInjected, useMultiApprove, useMultisig, useUnapprovedAccounts } from '../hooks';
import { AddressPair } from '../model';
import { extractExternal, txDoc, txMethod, txMethodDescription } from '../utils';
import { ArgObj, Args } from './Args';
import { Fee } from './Fee';
import { SubscanLink } from './SubscanLink';
export interface Entry {
  when: When;
  depositor: string;
  approvals: string[];
  address: string;
  callHash?: string;
  blockHash?: string;
  callData?: Call;
  meta?: Record<string, AnyJson>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

export interface When {
  height: number;
  index: number;
}

export interface EntriesProps {
  source: Entry[];
  account: KeyringAddress;
  isConfirmed?: boolean;
  isOnlyPolkadotModal?: boolean;
}

type ActionType = 'pending' | 'approve' | 'cancel';

interface Operation {
  type: ActionType;
  entry: Entry | null;
  accounts: string[];
}

const { Title, Text } = Typography;
const DEFAULT_OPERATION: Operation = { entry: null, type: 'pending', accounts: [] };

export function Entries({ source, isConfirmed, account, isOnlyPolkadotModal = true }: EntriesProps) {
  const { t } = useTranslation();
  const isInjected = useIsInjected();
  const [operation, setOperation] = useState<Operation>(DEFAULT_OPERATION);
  const { api, accounts = [] } = useApi();
  const { multisigAccount } = useMultisig();
  const { queueExtrinsic } = useContext(StatusContext);
  const [extrinsic, setExtrinsic] = useState<PartialQueueTxExtrinsic | null>(null);
  const [getApproveTx] = useMultiApprove();
  const [getUnapprovedInjectedList] = useUnapprovedAccounts();
  const [isSkeltonDisplay, setIsSkeltonDisplay] = useState(false);
  const handleAction = useCallback(
    (type: ActionType, data: Entry) => {
      if (type === 'pending') {
        return;
      }

      setIsSkeltonDisplay(true);

      if (type === 'approve') {
        const unapprovedAddresses = getUnapprovedInjectedList(data);
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const availableAccounts = accounts!
          .map((item) => item.address)
          .filter((extAddr) => unapprovedAddresses.includes(extAddr));

        getApproveTx(data, availableAccounts[0]).then((tx) => {
          const queueTx: PartialQueueTxExtrinsic = {
            extrinsic: tx,
            accountId: availableAccounts[0],
            txSuccessCb: () => setExtrinsic(null),
          };

          queueExtrinsic(queueTx);
          setExtrinsic(queueTx);
          setIsSkeltonDisplay(false);
        });

        setOperation({ entry: data, type, accounts: availableAccounts });
      }

      if (type === 'cancel') {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const multiAddress = multisigAccount!.address;
        const { threshold, who } = extractExternal(multiAddress);
        const others = who.filter((item) => item !== data.address);
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const tx = api!.tx.multisig.cancelAsMulti(threshold, others, data.when, data.callHash!);
        const queueTx: PartialQueueTxExtrinsic = {
          extrinsic: tx,
          accountId: data.depositor,
          txSuccessCb: () => {
            setExtrinsic(null);
          },
        };

        setExtrinsic(queueTx);
        queueExtrinsic(queueTx);
        setOperation({ entry: data, type, accounts: [] });
        setIsSkeltonDisplay(false);
      }
    },
    [accounts, api, getApproveTx, getUnapprovedInjectedList, multisigAccount, queueExtrinsic]
  );

  const columns: ColumnsType<Entry> = [
    {
      title: t(!isConfirmed ? 'call_hash' : 'block_hash'),
      dataIndex: 'hash',
      align: 'center',
      render(hash: string) {
        return !isConfirmed ? hash : <SubscanLink block={hash} />;
      },
    },
    {
      title: t('action'),
      dataIndex: 'callData',
      align: 'center',
      render(data) {
        const call = data?.toHuman();

        if (call) {
          return call.section + '(' + call.method + ')';
        } else {
          return '-';
        }
      },
    },
    {
      title: t('progress'),
      dataIndex: 'approvals',
      align: 'center',
      render(approvals: string[]) {
        const cur = (approvals && approvals.length) || 0;

        return cur + '/' + account.meta.threshold;
      },
    },
    {
      title: t('status.index'),
      key: 'status',
      align: 'center',
      // eslint-disable-next-line complexity
      render(_, row) {
        if (row.status) {
          return <span>{t(`status.${row.status}`)}</span>;
        }

        const actions: ActionType[] = [];
        // eslint-disable-next-line react/prop-types
        const pairs = (account.meta?.addressPair ?? []) as AddressPair[];
        const injectedAccounts: string[] = pairs.filter((pair) => isInjected(pair.address)).map((pair) => pair.address);

        if (injectedAccounts.includes(row.depositor)) {
          actions.push('cancel');
        }

        const localAccountInMultisigPairList = intersection(
          injectedAccounts,
          pairs.map((pair) => pair.address)
        );
        const approvedLocalAccounts = intersection(localAccountInMultisigPairList, row.approvals);

        if (approvedLocalAccounts.length !== localAccountInMultisigPairList.length) {
          actions.push('approve');
        }

        if (actions.length === 0) {
          // eslint-disable-next-line react/prop-types
          if (row.approvals && row.approvals.length === account.meta.threshold) {
            actions.push('pending');
          }
        }

        return (
          <Space>
            {actions.map((action) => (
              <Button key={action} onClick={() => handleAction(action, row)}>
                {t(action)}
              </Button>
            ))}
          </Space>
        );
      },
    },
  ];
  const expandedRowRender = (entry: Entry) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const progressColumnsNested: ColumnsType<any> = [
      { dataIndex: 'name' },
      {
        dataIndex: 'address',
        render: (address) => (
          <Space size="middle">
            <BaseIdentityIcon theme="polkadot" size={32} value={address} />
            <SubscanLink address={address} copyable />
          </Space>
        ),
      },
      {
        key: 'status',
        render: (_, pair) => {
          const { address } = pair;
          const { approvals, when } = entry;
          const approved = approvals.includes(address);

          return approved ? (
            <SubscanLink extrinsic={when}>{t('status.approved')}</SubscanLink>
          ) : (
            <span>{t('status.pending')}</span>
          );
        },
      },
    ];
    const callDataJson = entry.callData?.toJSON() ?? {};
    const args = ((entry.meta?.args ?? []) as ArgObj[]).map((arg) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const value = (callDataJson.args as any)[arg?.name ?? ''];

      return { ...arg, value };
    });

    return (
      <>
        <Title level={5}>{t('progress')}</Title>
        <Table
          columns={progressColumnsNested}
          dataSource={account.meta.addressPair as { key: string; name: string; address: string }[]}
          pagination={false}
          bordered
          showHeader={false}
          className="mb-4 mx-4"
        />

        <Title level={5}>{t('parameters')}</Title>
        <Args args={args} className="mb-4 mx-4" />
      </>
    );
  };

  return (
    <Spin size="large" spinning={isSkeltonDisplay}>
      <Table
        dataSource={source}
        columns={columns}
        rowKey="callHash"
        pagination={false}
        expandable={{ expandedRowRender, defaultExpandAllRows: true }}
      ></Table>

      {/* By default we use polkadot approve workflow only, components below would not display */}
      {!isOnlyPolkadotModal && (
        <OperationModals
          operation={operation}
          queueTx={extrinsic}
          onTxChange={(tx, accountId) => {
            const queueTx: PartialQueueTxExtrinsic = {
              extrinsic: tx,
              accountId,
              txSuccessCb: () => setExtrinsic(null),
            };

            queueExtrinsic(queueTx);
            setExtrinsic(queueTx);
          }}
        />
      )}
    </Spin>
  );
}

/* ---------------------------Custom extrinsic operation modals----------------- */

interface OperationModalsProps {
  operation?: Operation;
  queueTx?: PartialQueueTxExtrinsic | null;
  onCancel?: () => void;
  onTxChange?: (tx: SubmittableExtrinsic, account: string) => void;
}

function OperationModals({ operation, queueTx, onCancel, onTxChange }: OperationModalsProps) {
  const { t } = useTranslation();
  const { api } = useApi();
  const { fee } = useFee();
  const [getApproveTx] = useMultiApprove();
  const { queueExtrinsic } = useContext(StatusContext);

  return (
    <>
      <Modal
        destroyOnClose
        title={t('multisig.cancel')}
        visible={operation && !!operation.entry && operation.type === 'cancel'}
        footer={[
          <Button type="default" onClick={onCancel} key="cancel">
            {t('cancel')}
          </Button>,
          <Button
            type="primary"
            disabled={fee === 'calculating'}
            onClick={() => {
              if (queueTx) {
                queueExtrinsic(queueTx);
              }
            }}
            key="confirm"
          >
            {t('submit')}
          </Button>,
        ]}
      >
        <Descriptions column={1}>
          <Descriptions.Item label={t('pending_hash')}>
            <Typography.Text copyable>{operation?.entry?.callHash}</Typography.Text>
          </Descriptions.Item>
          <Descriptions.Item label={t('account')}>{operation?.entry?.depositor}</Descriptions.Item>
          <Descriptions.Item label={t('fee')}>
            <Fee extrinsic={queueTx?.extrinsic}></Fee>
          </Descriptions.Item>
        </Descriptions>
      </Modal>

      <Modal
        title={t('multisig.approval')}
        visible={!!operation && !!operation.entry && operation.type === 'approve'}
        destroyOnClose
        style={{ minWidth: 800 }}
        onCancel={onCancel}
        footer={[
          <Button onClick={onCancel} key="cancel">
            {t('cancel')}
          </Button>,
          <Button
            type="primary"
            key="approve"
            onClick={() => {
              if (queueTx) {
                queueExtrinsic(queueTx);
              }
            }}
          >
            {t('submit')}
          </Button>,
        ]}
      >
        <Form>
          <Form.Item label={t('pending_hash')}>
            <Text copyable>{operation?.entry?.callHash}</Text>
          </Form.Item>

          <Form.Item label={t('account')}>
            <Select
              onChange={(value: string) => {
                if (operation && operation.entry && onTxChange) {
                  getApproveTx(operation.entry, value).then((tx) => {
                    onTxChange(tx, value);
                  });
                }
              }}
            >
              {operation?.accounts.map((addr) => (
                <Select.Option value={addr} key={addr}>
                  {addr}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item label={t('multisig.from_chain')}>
            {/* TODO support edit */}
            <Text code>{operation?.entry?.callData?.toString()}</Text>
          </Form.Item>
        </Form>

        <Descriptions layout="vertical" column={1}>
          <Descriptions.Item
            label={
              <Title level={5}>
                {t('multisig.sending_transaction', {
                  transaction: txMethod(operation?.entry?.callData, api),
                })}
              </Title>
            }
          >
            {txDoc(operation?.entry?.callData)}
          </Descriptions.Item>
          {txMethodDescription(operation?.entry?.callData, api).map(({ name, type, value }) => (
            <Descriptions.Item label={<Typography.Title level={5}>{`${name} ${type}`}</Typography.Title>} key={name}>
              {value}
            </Descriptions.Item>
          ))}
        </Descriptions>

        <Descriptions column={1}>
          <Descriptions.Item label={t('fee')}>
            <Fee></Fee>
          </Descriptions.Item>
        </Descriptions>

        <Typography.Text>{t('multisig.approval_tip')}</Typography.Text>
      </Modal>
    </>
  );
}
