import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import React from "react";
import { Text, TextInput, TouchableOpacity, View } from "react-native";
 
type FAQAction =
  | { label: string; route: string; params?: any }
  | { label: string; onPress: () => void };
 
type FAQItem = {
  id: string;
  question: string;
  answer: string;
  actions?: FAQAction[];
};
 
const FAQS: FAQItem[] = [
  {
    id: "print-download",
    question: "How do I print or download a document?",
    answer:
      "Open any document preview (PR/PO/ORS/RFQ/etc.).\nTap Print to open the system print dialog.\nTap Download PDF to generate a PDF and share/save it.",
  },
  {
    id: "blank-template",
    question: "How do I download a blank template (no pre-filled fields)?",
    answer:
      "Inside the document preview, tap the Filled/Template toggle.\nSwitch to Template, then tap Print or Download PDF.",
  },
  {
    id: "track-pr",
    question: "Where can I track the status of my Purchase Requests?",
    answer:
      "Go to the Procurement module and open a PR to see its current status and history.",
    actions: [{ label: "Open Procurement", route: "Procurement" }],
  },
  {
    id: "no-internet",
    question: "What happens if I have no internet connection?",
    answer:
      "Actions that require the server will show a warning when you are offline.\nYou can still review screens that were already loaded, and use document previews.",
  },
  {
    id: "canvassing",
    question: "How does the canvassing / RFQ flow work?",
    answer:
      "PRs move through PR → RFQ → PO → Delivery → Payment.\nIn this monitoring app, you primarily view progress and generated documents per PR.",
  },
];
 
export default function FAQSection({ navigation }: { navigation: any }) {
  const [openId, setOpenId] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState("");
 
  const items = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return FAQS;
    return FAQS.filter(
      (x) =>
        x.question.toLowerCase().includes(q) || x.answer.toLowerCase().includes(q),
    );
  }, [query]);
 
  const runAction = (a: FAQAction) => {
    if ("onPress" in a) return a.onPress();
    navigation?.navigate?.(a.route, a.params);
  };
 
  return (
    <View style={{ marginTop: 14, paddingHorizontal: 12 }}>
      <View
        style={{
          backgroundColor: "#ffffff",
          borderRadius: 12,
          borderWidth: 1,
          borderColor: "#e5e7eb",
          overflow: "hidden",
        }}
      >
        <View
          style={{
            paddingHorizontal: 14,
            paddingTop: 14,
            paddingBottom: 10,
            borderBottomWidth: 1,
            borderBottomColor: "#f3f4f6",
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <View
              style={{
                width: 30,
                height: 30,
                borderRadius: 10,
                backgroundColor: "#ecfdf5",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <MaterialIcons name="help-outline" size={18} color="#064E3B" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: "800", color: "#111827" }}>
                FAQs
              </Text>
              <Text style={{ fontSize: 11.5, color: "#6b7280", marginTop: 1 }}>
                Quick help for common tasks
              </Text>
            </View>
          </View>
 
          <View style={{ marginTop: 10 }}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                borderWidth: 1,
                borderColor: "#e5e7eb",
                backgroundColor: "#f9fafb",
                borderRadius: 12,
                paddingHorizontal: 10,
                paddingVertical: 8,
              }}
            >
              <MaterialIcons name="search" size={16} color="#9ca3af" />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search FAQs…"
                placeholderTextColor="#9ca3af"
                style={{ flex: 1, fontSize: 12.5, color: "#111827" }}
              />
              {!!query.trim() && (
                <TouchableOpacity onPress={() => setQuery("")} hitSlop={8}>
                  <MaterialIcons name="close" size={16} color="#9ca3af" />
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
 
        <View>
          {items.length === 0 ? (
            <View style={{ padding: 14 }}>
              <Text style={{ fontSize: 12.5, color: "#6b7280" }}>
                No matches. Try a different keyword.
              </Text>
            </View>
          ) : (
            items.map((it) => {
              const open = openId === it.id;
              return (
                <View
                  key={it.id}
                  style={{
                    borderTopWidth: 1,
                    borderTopColor: "#f3f4f6",
                  }}
                >
                  <TouchableOpacity
                    onPress={() => setOpenId((prev) => (prev === it.id ? null : it.id))}
                    activeOpacity={0.85}
                    style={{
                      paddingHorizontal: 14,
                      paddingVertical: 12,
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 10,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 12.8,
                        fontWeight: "800",
                        color: "#111827",
                        flex: 1,
                      }}
                    >
                      {it.question}
                    </Text>
                    <MaterialIcons
                      name={open ? "expand-less" : "expand-more"}
                      size={20}
                      color="#6b7280"
                    />
                  </TouchableOpacity>
 
                  {open && (
                    <View style={{ paddingHorizontal: 14, paddingBottom: 14 }}>
                      <Text
                        style={{
                          fontSize: 12.5,
                          color: "#374151",
                          lineHeight: 18,
                        }}
                      >
                        {it.answer}
                      </Text>
 
                      {it.actions && it.actions.length > 0 && (
                        <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
                          {it.actions.map((a) => (
                            <TouchableOpacity
                              key={a.label}
                              onPress={() => runAction(a)}
                              activeOpacity={0.85}
                              style={{
                                paddingHorizontal: 12,
                                paddingVertical: 9,
                                borderRadius: 12,
                                backgroundColor: "#064E3B",
                              }}
                            >
                              <Text
                                style={{
                                  fontSize: 12,
                                  fontWeight: "800",
                                  color: "#ffffff",
                                }}
                              >
                                {a.label}
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      )}
                    </View>
                  )}
                </View>
              );
            })
          )}
        </View>
      </View>
    </View>
  );
}
