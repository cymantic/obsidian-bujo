import { App, PluginSettingTab, Setting } from 'obsidian';
import type BujoPlugin from './main';

export class BujoSettingTab extends PluginSettingTab {
  plugin: BujoPlugin;

  constructor(app: App, plugin: BujoPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    // Journal folder
    new Setting(containerEl)
      .setName('Journal folder')
      .setDesc('Location where daily notes will be stored.')
      .addText(text => text
        .setPlaceholder('journal')
        .setValue(this.plugin.settings.journalFolder)
        .onChange(async (value) => {
          this.plugin.settings.journalFolder = value || 'journal';
          await this.plugin.saveSettings();
        }));

    // Open on startup
    new Setting(containerEl)
      .setName('Open on startup')
      .setDesc('Automatically open the Daily Log view when Obsidian starts.')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.openOnStartup)
        .onChange(async (value) => {
          this.plugin.settings.openOnStartup = value;
          await this.plugin.saveSettings();
        }));

    // Date format (informational only for now)
    new Setting(containerEl)
      .setName('Date format')
      .setDesc('Format used for daily note filenames. Currently fixed as YYYY-MM-DD.')
      .addText(text => text
        .setValue(this.plugin.settings.dateFormat)
        .setDisabled(true));

    // Working days
    const workingDaysSetting = new Setting(containerEl)
      .setName('Working days')
      .setDesc('Select which days are working days for "next working day" calculations.');

    const daysContainer = workingDaysSetting.controlEl.createDiv({ cls: 'bujo-working-days' });
    const dayNames = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
    const dayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

    dayNames.forEach((dayName, index) => {
      const isActive = this.plugin.settings.workingDays[index];
      const btn = daysContainer.createEl('button', {
        cls: `bujo-day-btn${isActive ? ' active' : ''}`,
        text: dayName,
        attr: { type: 'button', title: dayLabels[index] }
      });

      btn.addEventListener('click', async () => {
        this.plugin.settings.workingDays[index] = !this.plugin.settings.workingDays[index];
        btn.toggleClass('active', this.plugin.settings.workingDays[index]);
        await this.plugin.saveSettings();
      });
    });

    // Start of week
    new Setting(containerEl)
      .setName('Start of week')
      .setDesc('First day of the week for "next week" migration calculations.')
      .addDropdown(dropdown => dropdown
        .addOption('1', 'Monday')
        .addOption('2', 'Tuesday')
        .addOption('3', 'Wednesday')
        .addOption('4', 'Thursday')
        .addOption('5', 'Friday')
        .addOption('6', 'Saturday')
        .addOption('0', 'Sunday')
        .setValue(String(this.plugin.settings.startOfWeek))
        .onChange(async (value) => {
          this.plugin.settings.startOfWeek = parseInt(value);
          await this.plugin.saveSettings();
        }));

    // Custom fonts
    new Setting(containerEl)
      .setName('Use custom fonts')
      .setDesc('Use BuJo\'s custom fonts for a classic journal aesthetic. When disabled, BuJo will inherit your Obsidian interface font.')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.useCustomFonts)
        .onChange(async (value) => {
          this.plugin.settings.useCustomFonts = value;
          await this.plugin.saveSettings();
          // Refresh the BuJo view to apply font changes
          const view = this.plugin.getBujoView();
          if (view) await view.render();
        }));
  }
}
