import { View } from 'react-native';
import ProcurementContent from '../ProcurementContent';

// // With handlers and custom data
// <ProcurementContent
//   records={yourRecords}
//   onViewRecord={(r) => router.push(`/pr/${r.id}`)}
//   onEditRecord={(r) => router.push(`/pr/${r.id}/edit`)}
//   onCreatePress={() => router.push("/pr/new")}
//   initialTab="purchase_request"
// />

export default function ProcurementScreen() {
  return (
    <View className="flex-1 bg-gray-50">
      <ProcurementContent />
    </View>
  );
}
