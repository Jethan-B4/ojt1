import React, { useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import DeliveryModule from '../procurement/DeliveryModule';
import PaymentModule from '../procurement/PaymentModule';
import POModule from '../procurement/POModule';
import PRModule from '../procurement/PRModule';

type MainTab = 'purchase_request' | 'purchase_order' | 'delivery_inspection' | 'payment_closure';

// // With handlers and custom data
// <ProcurementContent
//   records={yourRecords}
//   onViewRecord={(r) => router.push(`/pr/${r.id}`)}
//   onEditRecord={(r) => router.push(`/pr/${r.id}/edit`)}
//   onCreatePress={() => router.push("/pr/new")}
//   initialTab="purchase_request"
// />

const MAIN_TABS: { key: MainTab; label: string; short: string }[] = [
  { key: 'purchase_request',    label: 'Purchase Request',      short: 'PR'       },
  { key: 'purchase_order',      label: 'Purchase Order',        short: 'PO'       },
  { key: 'delivery_inspection', label: 'Delivery & Inspection', short: 'Delivery' },
  { key: 'payment_closure',     label: 'Payment & Closure',     short: 'Payment'  },
];

function TabStrip({ active, onSelect }: { active: MainTab; onSelect: (t: MainTab) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}
      className="bg-white border-b border-gray-200 max-h-12"
      contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8, gap: 4 }}>
      {MAIN_TABS.map((tab) => {
        const on = tab.key === active;
        return (
          <TouchableOpacity key={tab.key} onPress={() => onSelect(tab.key)} activeOpacity={0.8}
            className={`h-9 px-4 rounded-t-xl border-b-2 items-center justify-center ${on ? 'bg-[#064E3B] border-[#064E3B]' : 'bg-transparent border-transparent'}`}>
            <Text className={`text-[13px] font-semibold ${on ? 'text-white' : 'text-gray-400'}`}>{tab.short}</Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

export default function ProcurementScreen() {
  const [active, setActive] = useState<MainTab>('purchase_request');
  return (
    <View className="flex-1 bg-gray-50">
      <TabStrip active={active} onSelect={setActive} />
      {active === 'purchase_request' && <PRModule />}
      {active === 'purchase_order' && <POModule />}
      {active === 'delivery_inspection' && <DeliveryModule />}
      {active === 'payment_closure' && <PaymentModule />}
    </View>
  );
}
