import frappe
from frappe.model.document import Document

class FIceCoreCallSession(Document):
	def before_save(self):
		if self.status == "Ended" and self.accepted_at and self.ended_at:
			accepted = frappe.utils.get_datetime(self.accepted_at)
			ended = frappe.utils.get_datetime(self.ended_at)
			self.duration = int((ended - accepted).total_seconds())
