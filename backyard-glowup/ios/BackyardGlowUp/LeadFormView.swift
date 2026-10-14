import SwiftUI

// The "Get This Built" sheet: sends the customer's contact details and their
// Glow Up Plus design to the contractor as a quote request.
struct LeadFormView: View {
    let design: Design
    let model: GlowUpModel
    @Environment(\.dismiss) private var dismiss

    private enum Field: Hashable { case name, phone, email, zip, notes }

    @State private var lead = LeadDraft()
    @State private var isSending = false
    @State private var errorMessage: String?
    @State private var isSent = false
    @State private var edited = false
    @FocusState private var focus: Field?

    var body: some View {
        NavigationStack {
            Group {
                if isSent {
                    sentView
                } else {
                    form
                }
            }
            .navigationTitle("Get This Built")
            .navigationBarTitleDisplayMode(.inline)
            .interactiveDismissDisabled(isSending)
        }
    }

    private var form: some View {
        Form {
            Section {
                TextField("Name", text: $lead.name)
                    .textContentType(.name)
                    .textInputAutocapitalization(.words)
                    .focused($focus, equals: .name)
                TextField("Phone", text: $lead.phone)
                    .keyboardType(.phonePad)
                    .textContentType(.telephoneNumber)
                    .focused($focus, equals: .phone)
                TextField("Email", text: $lead.email)
                    .keyboardType(.emailAddress)
                    .textContentType(.emailAddress)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .focused($focus, equals: .email)
                TextField("ZIP code", text: $lead.zip)
                    .keyboardType(.numbersAndPunctuation)
                    .textContentType(.postalCode)
                    .focused($focus, equals: .zip)
            } header: {
                Text("Your details")
            } footer: {
                Text("Add a phone number or email so the contractor can reach you.")
            }

            Section("About the project") {
                TextField("Anything the contractor should know? (optional)", text: $lead.notes, axis: .vertical)
                    .lineLimit(3...8)
                    .focused($focus, equals: .notes)
            }

            // The first local problem only shows once the customer has finished editing a
            // field, and it explains a greyed-out Send ahead of an older server error.
            if let message = (edited ? lead.validationError : nil) ?? errorMessage {
                Section {
                    Text(message)
                        .font(.footnote)
                        .foregroundStyle(.red)
                        .listRowBackground(Color.clear)
                }
            }
        }
        .onChange(of: focus) { old, _ in
            if old != nil { edited = true }
        }
        .disabled(isSending)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button("Cancel") { dismiss() }
                    .disabled(isSending)
            }
            ToolbarItem(placement: .confirmationAction) {
                if isSending {
                    ProgressView()
                } else {
                    Button("Send") {
                        Task { await send() }
                    }
                    .bold()
                    .disabled(lead.validationError != nil)
                }
            }
        }
    }

    private var sentView: some View {
        VStack(spacing: 16) {
            Image(systemName: "checkmark.circle.fill")
                .font(.system(size: 64))
                .foregroundStyle(.green)
            Text("Request sent")
                .font(.title2.bold())
            Text("\(model.contractorName ?? "A local contractor") will contact you soon to plan your project and give you a quote.")
                .multilineTextAlignment(.center)
                .foregroundStyle(.secondary)
            if let phone = model.contractorPhone {
                Text("Questions? Call \(phone).")
                    .multilineTextAlignment(.center)
                    .foregroundStyle(.secondary)
            }
            Button {
                dismiss()
            } label: {
                Text("Done")
                    .font(.headline)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 6)
            }
            .buttonStyle(.borderedProminent)
            .padding(.top, 8)
        }
        .padding(24)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private func send() async {
        guard lead.validationError == nil else { return }
        isSending = true
        errorMessage = nil
        defer { isSending = false }

        let trimmed = lead.trimmed
        do {
            _ = try await model.client.submitLead(
                designID: design.id,
                name: trimmed.name,
                phone: trimmed.phone,
                email: trimmed.email,
                zip: trimmed.zip,
                notes: trimmed.notes
            )
            isSent = true
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

// What the customer has typed so far.
struct LeadDraft {
    var name = ""
    var phone = ""
    var email = ""
    var zip = ""
    var notes = ""

    var trimmed: LeadDraft {
        LeadDraft(
            name: name.trimmingCharacters(in: .whitespacesAndNewlines),
            phone: phone.trimmingCharacters(in: .whitespacesAndNewlines),
            email: email.trimmingCharacters(in: .whitespacesAndNewlines),
            zip: zip.trimmingCharacters(in: .whitespacesAndNewlines),
            notes: notes.trimmingCharacters(in: .whitespacesAndNewlines)
        )
    }

    // Mirrors the server's checks for POST /api/leads, in the same order and with the same
    // messages, so Send only turns on for a request the server will accept. Lengths count
    // UTF-16 units, like JavaScript's .length.
    var validationError: String? {
        let lead = trimmed
        if lead.name.isEmpty { return "Add your name" }
        if lead.name.utf16.count > 100 { return "Keep your name under 100 characters" }
        if lead.phone.isEmpty && lead.email.isEmpty { return "Add a phone number or email so the contractor can reach you" }
        if !lead.phone.isEmpty {
            let digits = lead.phone.unicodeScalars.filter { ("0"..."9").contains($0) }.count
            if digits < 7 || lead.phone.utf16.count > 30 { return "Check the phone number" }
        }
        if !lead.email.isEmpty {
            if lead.email.wholeMatch(of: #/[^\s@]+@[^\s@]+\.[^\s@]+/#) == nil || lead.email.utf16.count > 200 {
                return "Check the email address"
            }
        }
        if lead.zip.utf16.count < 3 || lead.zip.utf16.count > 12 { return "Add your ZIP code" }
        if lead.notes.utf16.count > 1000 { return "Keep notes under 1,000 characters" }
        return nil
    }
}
