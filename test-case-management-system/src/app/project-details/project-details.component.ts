import { Component, OnInit, ChangeDetectionStrategy, inject, signal, NgModule, AfterViewInit } from '@angular/core';
import { FormGroup, FormControl, FormArray, FormBuilder, Validators, AbstractControl, FormsModule } from '@angular/forms';
import { COMMA, ENTER } from '@angular/cdk/keycodes';
import { MdbFormsModule } from 'mdb-angular-ui-kit/forms'; // If you're using MDB UI Kit
import {LiveAnnouncer} from '@angular/cdk/a11y';
import { ReactiveFormsModule } from '@angular/forms';
import { MatChipEditedEvent, MatChipInputEvent, MatChipsModule } from '@angular/material/chips'; // Material Chips Module
import { MatButtonModule } from '@angular/material/button';
import {MatFormFieldModule} from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import {MatIconModule} from '@angular/material/icon';
import { MatNativeDateModule } from '@angular/material/core';
import { MatDatepickerModule } from '@angular/material/datepicker';
import {provideNativeDateAdapter} from '@angular/material/core';
import { NgbDatepicker, NgbDatepickerModule } from '@ng-bootstrap/ng-bootstrap';
import { NgMultiSelectDropDownModule, IDropdownSettings } from 'ng-multiselect-dropdown'; 

export interface Emails {
  name: string;
}

export interface dropdownItems {
  item_id: number;
  item_text: string;
}

@Component({
  selector: 'app-project-details',
  providers: [provideNativeDateAdapter()],
  imports: [MdbFormsModule, ReactiveFormsModule, MatChipsModule, MatIconModule, 
    MatFormFieldModule, MatButtonModule, MatSelectModule, MatNativeDateModule, 
    MatDatepickerModule, FormsModule, NgbDatepickerModule, NgMultiSelectDropDownModule,],
  templateUrl: './project-details.component.html',
  styleUrl: './project-details.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProjectDetailsComponent {
  readonly date = new FormControl(new Date());
  readonly addOnBlur = true;
  readonly separatorKeysCodes = [ENTER, COMMA] as const;
  readonly emails = signal<Emails[]>([]);
  readonly announcer = inject(LiveAnnouncer);
  public model2: any;

  dropdownList: dropdownItems[] = [];
  selectedItems: dropdownItems[] = [];
  dropdownSettings!: IDropdownSettings;
  ngOnInit() {
    this.dropdownList = [
      { item_id: 1, item_text: 'Mumbai' },
      { item_id: 2, item_text: 'Bangaluru' },
      { item_id: 3, item_text: 'Pune' },
      { item_id: 4, item_text: 'Navsari' },
      { item_id: 5, item_text: 'New Delhi' }
    ];
    this.selectedItems = [
      { item_id: 3, item_text: 'Pune' },
      { item_id: 4, item_text: 'Navsari' }
    ];
    this.dropdownSettings = {
      singleSelection: false,
      idField: 'item_id',
      textField: 'item_text',
      selectAllText: 'Select All',
      unSelectAllText: 'UnSelect All',
      itemsShowLimit: 3,
      allowSearchFilter: true
    };
  }
  onItemSelect(item: any) {
    console.log(item);
  }
  onSelectAll(items: any) {
    console.log(items);
  }


  add(event: MatChipInputEvent): void {
    const value = (event.value || '').trim();

    // Add our email
    if (value) {
      this.emails.update(emails => [...emails, {name: value}]);
    }

    // Clear the input value
    event.chipInput!.clear();
  }

  remove(email: Emails): void {
    this.emails.update(emails => {
      const index = emails.indexOf(email);
      if (index < 0) {
        return emails;
      }

      emails.splice(index, 1);
      this.announcer.announce(`Removed ${email.name}`);
      return [...emails];
    });
  }

  edit(email: Emails, event: MatChipEditedEvent) {
    const value = event.value.trim();

    // Remove email if it no longer has a name
    if (!value) {
      this.remove(email);
      return;
    }

    // Edit existing email
    this.emails.update(emails => {
      const index = emails.indexOf(email);
      if (index >= 0) {
        emails[index].name = value;
        return [...emails];
      }
      return emails;
    });
  }

    
    // Submit handler
    /* onSubmit() {
      if (this.rulesForm.valid) {
        console.log('Form submitted', this.rulesForm.value);
      }
    } */
}

